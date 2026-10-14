const TERMINAL = new Set(['completed', 'completed_full', 'completed_authorized_scope', 'partial', 'failed', 'cancelled', 'canceled']);
const SUCCESS = new Set(['completed', 'completed_full', 'completed_authorized_scope']);

function aggregateParentStatus(children = []) {
  const statuses = children.map(child => String(child?.status || 'queued').toLowerCase());
  if (!statuses.length || statuses.some(status => !TERMINAL.has(status))) return 'running';
  const successes = statuses.filter(status => SUCCESS.has(status)).length;
  const failures = statuses.filter(status => status === 'failed' || status === 'cancelled' || status === 'canceled' || status === 'partial').length;
  if (!failures) return 'completed';
  if (successes) return 'partial';
  return 'failed';
}

function childRunDefinitions(parentRunId, sites = [], { accountId, sourceId, windowStart = null, windowEnd = null } = {}) {
  if (!parentRunId) throw new Error('parentRunId is required');
  return sites.filter(site => site && site.enabled !== false).map(site => ({
    parentRunId,
    sourceId,
    accountId,
    siteId: site.siteId,
    windowStart,
    windowEnd,
    status: 'queued'
  }));
}

function removeInFlightSite(children, removedSiteId, reason = 'site removed while run was in flight') {
  return children.map(child => child.siteId === removedSiteId && !TERMINAL.has(String(child.status || '').toLowerCase())
    ? { ...child, status: 'failed', errorCode: 'SITE_REMOVED', errorMessage: reason }
    : child);
}

module.exports = { aggregateParentStatus, childRunDefinitions, removeInFlightSite, TERMINAL, SUCCESS };
