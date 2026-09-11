const { computeSchedule } = require('./scheduleSlots');

const VALID_REGIONS = new Set(['domestic', 'overseas']);

function parseDate(value) {
  if (value == null || value === '') return null;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function sameNullable(left, right) {
  return (left == null && right == null) || String(left) === String(right);
}

function accountIndex(accounts) {
  if (accounts instanceof Map) return accounts;
  return new Map((accounts || []).map(item => [item.id, item]));
}

function capabilityFor(capabilities, platform) {
  if (typeof capabilities === 'function') return capabilities(platform);
  if (capabilities instanceof Map) return capabilities.get(platform);
  return capabilities?.[platform];
}

function shanghaiClock(now) {
  const shifted = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return {
    day: shifted.getUTCDay() === 0 ? 7 : shifted.getUTCDay(),
    minute: shifted.getUTCHours() * 60 + shifted.getUTCMinutes()
  };
}

function parseMinute(value) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value || ''));
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function evaluateActiveWindow(activeWindow, now) {
  if (activeWindow == null) return { valid: true, allowed: true };
  let window = activeWindow;
  if (typeof window === 'string') {
    try { window = JSON.parse(window); } catch { return { valid: false, allowed: false }; }
  }
  if (!window || typeof window !== 'object' || Array.isArray(window)) return { valid: false, allowed: false };

  const keys = Object.keys(window);
  const knownKeys = new Set(['days', 'start', 'end']);
  if (keys.length === 0 || keys.some(key => !knownKeys.has(key))) return { valid: false, allowed: false };
  if ('days' in window && (!Array.isArray(window.days) || window.days.some(day => !Number.isInteger(day) || day < 1 || day > 7))) {
    return { valid: false, allowed: false };
  }

  const hasStart = 'start' in window;
  const hasEnd = 'end' in window;
  if (hasStart !== hasEnd) return { valid: false, allowed: false };
  const start = parseMinute(window.start);
  const end = parseMinute(window.end);
  if (hasStart && (start == null || end == null)) return { valid: false, allowed: false };

  const clock = shanghaiClock(now);
  const crossesMidnight = start != null && end != null && start > end;
  const applicableDay = crossesMidnight && clock.minute < end ? (clock.day === 1 ? 7 : clock.day - 1) : clock.day;
  if (window.days?.length && !window.days.includes(applicableDay)) return { valid: true, allowed: false };
  if (!hasStart) return { valid: true, allowed: true };
  return {
    valid: true,
    allowed: crossesMidnight ? clock.minute >= start || clock.minute < end : clock.minute >= start && clock.minute < end
  };
}

function activeWindowAllows(activeWindow, now) {
  return evaluateActiveWindow(activeWindow, now).allowed;
}

function rejected(source, reasonCode) {
  return { sourceId: source.id, status: 'rejected', reasonCode, triggerType: null, scheduledAt: null };
}

function sourceEligibility(source, account, capability, now) {
  if (!source.enabled) return 'SOURCE_DISABLED';
  if (!source.game_enabled) return 'GAME_DISABLED';
  if (source.community_status !== 'enabled') return 'COMMUNITY_DISABLED';
  if (!VALID_REGIONS.has(source.region_code)) return 'INVALID_REGION';
  if (!source.default_account_id || !account) return 'ACCOUNT_NOT_FOUND';
  if (account.source_id !== source.id || account.game_id !== source.game_id || account.platform !== source.platform || !sameNullable(account.community_id, source.community_id)) return 'OWNERSHIP_MISMATCH';
  if (!account.enabled) return 'ACCOUNT_DISABLED';
  if (source.auth_status !== 'authorized') return 'SOURCE_UNAUTHORIZED';
  if (parseDate(source.auth_expire_at) != null && parseDate(source.auth_expire_at) <= now.getTime()) return 'SOURCE_AUTH_EXPIRED';
  if (account.auth_status !== 'authorized') return 'ACCOUNT_UNAUTHORIZED';
  if (parseDate(account.auth_expire_at) != null && parseDate(account.auth_expire_at) <= now.getTime()) return 'ACCOUNT_AUTH_EXPIRED';
  if (!capability || capability.available !== true) return 'CONNECTOR_NOT_FOUND';
  if (capability.supportsScheduling !== true) return 'CONNECTOR_CAPABILITY_UNAVAILABLE';
  const activeWindow = evaluateActiveWindow(source.active_window, now);
  if (!activeWindow.valid) return 'INVALID_ACTIVE_WINDOW';
  if (!activeWindow.allowed) return 'OUTSIDE_ACTIVE_WINDOW';
  return null;
}

async function scheduleSources({
  sources = [],
  accounts = [],
  connectorCapabilities = {},
  now,
  lastProcessedBySource = {},
  leaseAdapter,
  enqueue,
  existingEvidence = []
} = {}) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new TypeError('now must be a valid Date');
  if (!leaseAdapter || typeof leaseAdapter.acquire !== 'function') throw new TypeError('leaseAdapter.acquire is required');
  if (typeof enqueue !== 'function') throw new TypeError('enqueue is required');

  const byAccountId = accountIndex(accounts);
  const decisions = [];

  for (const source of sources) {
    const account = byAccountId.get(source.default_account_id);
    const reasonCode = sourceEligibility(source, account, capabilityFor(connectorCapabilities, source.platform), now);
    if (reasonCode) {
      decisions.push(rejected(source, reasonCode));
      continue;
    }

    let schedule;
    try {
      schedule = computeSchedule({
        now,
        frequencySeconds: source.frequency_seconds,
        effectiveAt: source.schedule_effective_at,
        lastProcessedScheduledAt: lastProcessedBySource instanceof Map
          ? lastProcessedBySource.get(source.id)
          : lastProcessedBySource[source.id]
      });
    } catch {
      decisions.push(rejected(source, 'INVALID_SCHEDULE_CONFIG'));
      continue;
    }

    if (!schedule.dueSlotAt) {
      decisions.push({ ...rejected(source, 'NOT_DUE'), status: 'not_due', nextSlotAt: schedule.nextSlotAt });
      continue;
    }

    const intent = {
      sourceId: source.id,
      accountId: account.id,
      platform: source.platform,
      regionCode: source.region_code,
      triggerType: schedule.triggerType,
      scheduledAt: schedule.dueSlotAt,
      nextSlotAt: schedule.nextSlotAt,
      windowStartAt: schedule.window?.windowStartAt || null,
      windowEndAt: schedule.window?.windowEndAt || null,
      scheduleVersion: Number(source.schedule_version || 1),
      idempotencyKey: `${source.id}:${schedule.dueSlotAt}`
    };

    let lease;
    try {
      lease = await leaseAdapter.acquire(intent);
    } catch {
      decisions.push({ ...intent, status: 'failed', reasonCode: 'LEASE_FAILED' });
      continue;
    }
    if (!lease?.acquired) {
      decisions.push({ ...intent, status: 'skipped', reasonCode: 'PREVIOUS_RUN_ACTIVE' });
      continue;
    }

    try {
      const queued = await enqueue({ ...intent, leaseToken: lease.leaseToken || null });
      if (queued?.created === false) {
        if (typeof leaseAdapter.release === 'function') await leaseAdapter.release(intent, lease);
        decisions.push({ ...intent, status: 'duplicate', reasonCode: 'SLOT_ALREADY_EXISTS', existingRunId: queued.existingRunId || null });
      } else {
        decisions.push({ ...intent, status: 'enqueued', reasonCode: null, runId: queued?.runId || null, leaseToken: lease.leaseToken || null });
      }
    } catch {
      if (typeof leaseAdapter.release === 'function') {
        try { await leaseAdapter.release(intent, lease); } catch {}
      }
      decisions.push({ ...intent, status: 'failed', reasonCode: 'ENQUEUE_FAILED' });
    }
  }

  return { decisions, evidence: [...existingEvidence, ...decisions] };
}

module.exports = { scheduleSources, sourceEligibility, activeWindowAllows };
