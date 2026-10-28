const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { qualitySnapshotSql } = require('../../server/src/services/qualityPolicy');
const { severitiesForRiskMode } = require('../../shared/riskModes');
const { isChineseExplanation } = require('../../server/src/integrations/chineseExplanation');
const DELIVERY_CONTRACT_VERSION = 'combined-risk-settled-v2';

function deliveryDate(value, now) {
  const raw = String(value || '').replace(' ', 'T');
  const timestamp = value instanceof Date ? value : new Date(/[zZ]$|[+-]\d{2}:\d{2}$/.test(raw) ? raw : raw + 'Z');
  if (!Number.isFinite(timestamp.getTime())) return { eligible: false };
  const midnight = Date.parse(new Date(now + 8 * 3600000).toISOString().slice(0, 10) + 'T00:00:00+08:00');
  return { eligible: timestamp.getTime() >= midnight - 86400000 && timestamp.getTime() <= now,
    backfill: timestamp.getTime() < midnight,
    day: new Date(timestamp.getTime() + 8 * 3600000).toISOString().slice(0, 10) };
}

function hasQualityReason(value) {
  return typeof value === 'string' && value.trim().length >= 10 && isChineseExplanation(value)
    && !/TypeSafe\s*结构化|暂无.*(?:推荐|分析)|推荐理由.*生成中|符合标准|正常讨论.*推荐判断/i.test(value);
}
function notificationWindow(run) {
  const parse = value => {
    if (value instanceof Date) return value;
    const raw = String(value || '').replace(' ', 'T');
    return new Date(/[zZ]$|[+-]\d{2}:\d{2}$/.test(raw) ? raw : raw + 'Z');
  };
  const mysql = date => date.toISOString().replace('T', ' ').replace('Z', '');
  if (run.window_start || run.window_end) {
    const start = parse(run.window_start), end = parse(run.window_end);
    return Number.isFinite(start.getTime()) && Number.isFinite(end.getTime()) && start < end ? { start: mysql(start), end: mysql(end) } : null;
  }
  // Legacy standalone collections may omit their saved window. Apply the same
  // Beijing previous-day-midnight through collection-start rule as the scheduler.
  const end = parse(run.started_at || run.finished_at);
  if (!Number.isFinite(end.getTime())) return null;
  const day = new Date(end.getTime() + 8 * 3600000).toISOString().slice(0, 10);
  const start = new Date(Date.parse(day + 'T00:00:00+08:00') - 86400000);
  return { start: mysql(start), end: mysql(end) };
}

const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const safeText = value => String(value || '').replace(/[<>]/g, '').replace(/\r?\n/g, ' ').trim();
const versionKey = (row, robot) => digest(`${robot}:${row.id}:${row.fingerprint}`);
async function readJson(file) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

function messages(run, rows, failed, pushType = 'urgent', sentAt = Date.now()) {
  if (pushType === 'quality' && rows.some(row => !hasQualityReason(row.quality_reason))) {
    throw Object.assign(new Error('Quality recommendation reason is required'), { code: 'QUALITY_REASON_REQUIRED' });
  }
  const label = { urgent: '紧急告警', attention: '关注级', quality: '社区亮点' }[pushType];
  const icon = { urgent: '🚨', attention: '🟠', quality: '☀️' }[pushType];
  // Content is untrusted Markdown: keep headings, links and quotes owned by
  // the template, even when the original contains #, --- or link syntax.
  const markdown = value => safeText(value).replace(/[\\`*_{}\[\]()#+.!|~>\-]/g, '\\$&');
  const excerpt = (value, limit) => {
    const chars = Array.from(safeText(value));
    return markdown(chars.slice(0, limit).join('') + (chars.length > limit ? '…' : ''));
  };
  const community = excerpt(run.community_name || run.game_name, 60);
  const platformCode = String(run.platform || '').trim().toLowerCase();
  const platform = ({ bigplayer_h5: 'BigPlayer', bigplayer: 'BigPlayer', facebook: 'Facebook', discord: 'Discord', taptap: 'TapTap' })[platformCode] || safeText(run.platform) || '未知平台';
  return rows.map((row, i) => {
    const type = row.content_type === 'comment' || row.content_type === 'review' ? '评论' : '帖子/动态';
    const rawTime = String(row.published_at || '').replace(' ', 'T');
    const timestamp = row.published_at instanceof Date ? row.published_at : new Date(/[zZ]$|[+-]\d{2}:\d{2}$/.test(rawTime) ? rawTime : `${rawTime}Z`);
    const published = Number.isFinite(timestamp.getTime()) ? timestamp.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '-';
    const linkQuery = new URLSearchParams({ contentId: String(row.id) });
    if (run.community_id || row.community_id) linkQuery.set('communityId', run.community_id || row.community_id);
    if (run.region_code) linkQuery.set('regionCode', run.region_code);
    if (Number.isFinite(timestamp.getTime())) { const day = new Date(timestamp.getTime() + 8 * 3600000).toISOString().slice(0, 10); linkQuery.set('publishedFrom', day); linkQuery.set('publishedTo', day); }
    const contentUrl = 'https://chat.q1.com/apps/public-opinion/admin/PublicOpinion/content.html?' + linkQuery;
    const subject = excerpt(row.body || row.title, 32) || '暂无文字内容';
    const date = deliveryDate(row.published_at, sentAt);
    const backfill = date.eligible && date.backfill ? `【补推 ${date.day}】` : '';
    const title = `${backfill}${safeText(run.community_name || run.game_name)} · ${platform} · ${label}`;
    const sections = [
      `### ${backfill}${pushType === 'urgent' ? '' : icon + ' '}${label}｜${subject}`,
      ...(backfill ? [`**补推说明：本条为 ${date.day} 发布的内容。**`] : []),
      `**${community}**　${type}`,
      `平台：${markdown(platform)}`,
      `**原文**\n\n> ${excerpt(row.body || row.title, 300) || '暂无文字内容'}`,
      ...(safeText(row.translated_body || row.translated_title)
        ? [`**中文翻译**\n\n${excerpt(row.translated_body || row.translated_title, 300)}`]
        : run.region_code === 'overseas' ? ['**中文翻译**\n\n翻译暂未完成，请稍后在内容详情查看。'] : []),
      `**${pushType === 'quality' ? 'AI 推荐理由' : 'AI 分析原因'}**\n\n${excerpt(pushType === 'quality' ? row.quality_reason : row.analysis_reason, 800) || '暂无AI分析原因'}`,
      `发布人昵称：${excerpt(row.author_name, 80) || '-'}\n\n发布人ID：${excerpt(row.platform_author_id, 100) || '原平台未提供'}\n\n${type === '评论' ? '评论ID' : '帖子ID'}：${markdown(row.external_id) || '原平台未提供'}\n\n发布时间：${published}`,
      `[查看内容及完整分析](${contentUrl})`,
    ];
    if (['partial', 'failed'].includes(run.status)) sections.push('采集部分完成，仅推送已入库并完成分析的内容。');
    sections.push('来自舆情分析系统');
    return { rows: [row], title, text: sections.join('\n\n') };
  });
}

// The minute task watches finished collections. Deliver settled contents first;
// keep the run open for remaining analysis. Never send mid-collection.
async function dispatchCollections({ repo, service, now = () => Date.now(), pause = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  const config = await service.read();
  const routes = [...Object.entries(config.communityRoutes || {}).map(([key, route]) => ({ key, route, kind: 'communityRoutes' })), ...Object.entries(config.sourceRoutes || {}).map(([key, route]) => ({ key, route, kind: 'sourceRoutes' })), ...Object.entries(config.routes || {}).map(([key, route]) => ({ key, route, kind: 'routes' }))].filter(({ route }) => route.enabled && route.robot && route.enabledAt);
  const result = { checkedAt: new Date(now()).toISOString(), mode: 'collection_summary', sent: 0, failed: 0, skipped: 0, waiting: 0, completedRuns: 0, runReadiness: [], configuredAccounts: routes.filter(r => r.kind === 'routes').length, configuredCommunities: routes.filter(r => r.kind === 'communityRoutes').length };
  if (!routes.length) return result;
  const token = service.token(config);
  const folder = path.join(service.directory, 'collection-deliveries');
  await fs.mkdir(folder, { recursive: true });
  const policyFile = path.join(folder, 'policy.json');
  // On first installation, look back 12 hours so a completed collection that
  // finished just before the watcher started is still delivered once.
  try { await fs.writeFile(policyFile, JSON.stringify({ startedAt: new Date(now() - 12 * 60 * 60 * 1000).toISOString() }), { flag: 'wx', mode: 0o600 }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  const policy = await readJson(policyFile);
  if (!Number.isFinite(Date.parse(policy?.startedAt))) throw Object.assign(new Error('Invalid delivery policy'), { code: 'BAAS_DINGTALK_STORAGE_ERROR' });
  // Respect earlier manual summaries and automatic alert receipts, including
  // ambiguous sends. They must never be blindly replayed by the new watcher.
  const legacyIds = new Set(); const legacyAlerts = new Set();
  const deliveredVersions = new Set();
  for (const name of await fs.readdir(folder)) {
    if (!name.startsWith('message-') || !name.endsWith('.json')) continue;
    const record = await readJson(path.join(folder, name));
    for (const [i, id] of (record?.contentIds || []).entries()) deliveredVersions.add(versionKey({ id, fingerprint: record.versions[i] }, record.robot + (record.deliverySuffix || '')));
  }
  const legacyFolder = path.join(service.directory, 'deliveries');
  for (const name of await fs.readdir(legacyFolder).catch(e => { if (e.code === 'ENOENT') return []; throw e; })) {
    if (!name.endsWith('.json')) continue;
    const record = await readJson(path.join(legacyFolder, name));
    if (record?.alertId) legacyAlerts.add(`${record.robot}:${record.alertId}`);
    for (const id of record?.contentIds || []) legacyIds.add(`${record.robot}:${id}`);
  }
  for (const { key, route, kind } of routes) {
   for (const pushType of (route.pushTypes || ['urgent'])) {
    if (!['urgent', 'attention', 'quality'].includes(pushType)) continue;
    const activation = route.pushTypeEnabledAt?.[pushType] || (pushType === 'urgent' ? route.enabledAt : null);
    if (!activation) continue;
    const suffix = pushType === 'urgent' ? '' : `:${pushType}:${activation}`;
    const from = new Date(Math.max(Date.parse(policy.startedAt), Date.parse(activation)));
    if (!Number.isFinite(from.getTime())) throw new Error('INVALID_ROUTE_TIME');
    for (let offset = 0; ; offset += 100) {
      const runs = await repo.query(`SELECT r.id,r.status,r.started_at,r.finished_at,r.window_start,r.window_end,s.id source_id,s.platform,s.game_id,s.community_id,r.account_id,g.name game_name,g.region_code,cm.name community_name
        FROM po_sync_runs r JOIN po_sources s ON s.id=r.source_id JOIN po_games g ON g.id=s.game_id JOIN po_communities cm ON cm.id=s.community_id
        WHERE r.parent_run_id IS NULL AND r.status IN ('completed','completed_full','completed_authorized_scope','partial','failed')
        AND r.finished_at>=? ${pushType === 'urgent' ? '' : 'AND r.started_at>=?'} AND s.enabled=1 AND ${kind === 'communityRoutes' ? 's.game_id=? AND s.community_id=?' : kind === 'sourceRoutes' ? 's.game_id=? AND s.id=?' : 'r.account_id=? AND s.id=?'}
        AND NOT EXISTS (SELECT 1 FROM po_sync_runs child WHERE child.parent_run_id=r.id AND child.status NOT IN ('completed','completed_full','completed_authorized_scope','partial','failed','cancelled'))
        ORDER BY r.finished_at,r.id LIMIT 100 OFFSET ?`, [from, ...(pushType === 'urgent' ? [] : [new Date(activation)]), kind !== 'routes' ? route.gameId : key, kind === 'communityRoutes' ? route.communityId : route.sourceId, offset]);
      for (const run of runs) {
        const override = config.sourceRoutes?.[run.source_id];
        if (kind !== 'sourceRoutes' && override) continue;
        if (kind === 'sourceRoutes' && run.source_id !== route.sourceId) continue;
        const runFile = path.join(folder, `run-${digest(`${run.id}:${route.robot}:${route.enabledAt}${suffix}`)}.json`);
        const previousRun = await readJson(runFile);
        // A failed analysis can be retried later. Its earlier completion marker
        // must not permanently hide newly successful urgent content.
        if (previousRun?.deliveryVersion === DELIVERY_CONTRACT_VERSION && !Number(previousRun.analysisFailed)) continue;
        const window = notificationWindow(run);
        if (!window) { result.waiting++; continue; }
        const scannedRows = await repo.query(`SELECT DISTINCT c.id,c.external_id,c.fingerprint,c.title,c.body,c.content_type,c.published_at,c.platform_author_id,c.author_name,a.severity,a.sentiment,a.analysis_reason,a.content_fingerprint,q.quality_reason,EXISTS(SELECT 1 FROM po_quality_candidates q WHERE q.content_id=c.id AND q.content_fingerprint=c.fingerprint AND COALESCE(a.sentiment,'')<>'negative' AND (q.recommend_home=1 OR q.recommend_pin=1 OR q.recommend_feature=1) AND ${qualitySnapshotSql().join(' AND ')}) quality_eligible,tr.translated_title,tr.translated_body,
          EXISTS(SELECT 1 FROM po_analysis_jobs j WHERE j.content_id=c.id AND j.content_fingerprint=c.fingerprint AND j.status IN ('pending','running','retryable')) analysis_pending,
          EXISTS(SELECT 1 FROM po_analysis_jobs j WHERE j.content_id=c.id AND j.content_fingerprint=c.fingerprint AND j.status='failed') analysis_failed
          FROM (SELECT id FROM po_sync_runs WHERE id=? UNION ALL SELECT id FROM po_sync_runs WHERE parent_run_id=? AND id<>?) member
          STRAIGHT_JOIN po_sync_run_contents rc ON rc.run_id=member.id
          JOIN po_contents c ON c.id=rc.content_id LEFT JOIN po_analyses a ON a.content_id=c.id LEFT JOIN po_quality_candidates q ON q.content_id=c.id AND q.content_fingerprint=c.fingerprint
          LEFT JOIN po_content_translations tr ON tr.content_id=c.id AND tr.target_language='zh-CN' AND tr.translation_version=? AND tr.content_fingerprint=c.fingerprint
          WHERE rc.change_type IN ('inserted','changed') AND c.is_deleted=0
          AND c.source_id=? AND c.game_id=? AND (c.community_id<=>?)
          AND c.published_at>=? AND c.published_at<? ORDER BY c.id`, [run.id, run.id, run.id, process.env.AI_TRANSLATION_VERSION || 'translation-v1', run.source_id, run.game_id, run.community_id, window.start, window.end]);
        // Apply the current Beijing calendar window, independent of the old run's
        // collection window. Repairs must never replay older historical backlog.
        const rows = scannedRows.filter(row => deliveryDate(row.published_at, now()).eligible);
        const analysisPending = row => Number(row.analysis_pending) || (!(row.content_fingerprint && row.content_fingerprint === row.fingerprint) && !Number(row.analysis_failed));
        const hasPendingAnalysis = rows.some(analysisPending);
        if (result.runReadiness.length < 30) result.runReadiness.push({ runId: run.id, pushType, contents: rows.length, pending: rows.filter(analysisPending).length, outdated: rows.filter(row => row.content_fingerprint !== row.fingerprint).length, failed: rows.filter(row => Number(row.analysis_failed)).length, risks: rows.filter(row => severitiesForRiskMode('urgent').includes(row.severity) && ['neutral','negative'].includes(row.sentiment)).length });
        const failed = rows.filter(row => Number(row.analysis_failed)).length;
        const eligible = [];
        let reasonPending = false;
        for (const row of rows) {
          // Finished collection can deliver each settled content independently.
          // Retain the run for later passes while any other analysis is pending.
          if (analysisPending(row)) continue;
          if (row.content_fingerprint !== row.fingerprint) continue;
          const matches = pushType === 'quality' ? Number(row.quality_eligible) === 1 : severitiesForRiskMode(pushType).includes(row.severity) && ['neutral', 'negative'].includes(row.sentiment);
          if (!matches) continue;
          if (pushType === 'urgent' && (legacyIds.has(`${route.robot}:${row.id}`) || deliveredVersions.has(versionKey(row, route.robot)))) { result.skipped++; continue; }
          if (pushType !== 'urgent' && deliveredVersions.has(versionKey(row, route.robot + suffix))) { result.skipped++; continue; }
          if (pushType === 'urgent' && legacyAlerts.size) {
            const links = await repo.query('SELECT alert_id FROM po_alert_contents WHERE content_id=?', [row.id]);
            if (links.some(link => legacyAlerts.has(`${route.robot}:${link.alert_id}`))) { result.skipped++; continue; }
          }
          if (pushType === 'quality' && !hasQualityReason(row.quality_reason)) { reasonPending = true; continue; }
          eligible.push(row);
        }
        for (const [index, row] of eligible.entries()) {
          const current = (await service.read())[kind]?.[key];
          if (!current?.enabled || current.robot !== route.robot || current.enabledAt !== route.enabledAt || JSON.stringify(current.pushTypes) !== JSON.stringify(route.pushTypes) || JSON.stringify(current.pushTypeEnabledAt) !== JSON.stringify(route.pushTypeEnabledAt)) return result;
          // A rate-limited batch may cross midnight. Recheck immediately before
          // claiming each message and render its label using the same instant.
          const sentAt = now();
          if (!deliveryDate(row.published_at, sentAt).eligible) { result.skipped++; continue; }
          const message = messages(run, eligible, failed, pushType, sentAt)[index];
          const record = { kind: 'collection_summary', pushType, deliverySuffix: suffix, runId: run.id, robot: route.robot, communityId: run.community_id, contentIds: message.rows.map(r => r.id), versions: message.rows.map(r => r.fingerprint), status: 'sending', attemptedAt: new Date(now()).toISOString() };
          const journal = path.join(folder, `message-${digest(`${run.id}:${route.robot}:${record.contentIds.join(':')}${suffix}`)}.json`);
          // main holds the same database dispatch lock as the old sender. Durable
          // claims precede network I/O; a timeout is ambiguous, so no blind retry.
          try { await fs.writeFile(journal, JSON.stringify(record), { flag: 'wx', mode: 0o600 }); }
          catch (error) { if (error.code === 'EEXIST') { result.skipped++; continue; } throw error; }
          for (const row of message.rows) deliveredVersions.add(versionKey(row, route.robot + suffix));
          try {
            const receipt = await service.request(token, 'POST', 'v1/dingtalk/robot/send', { robot: route.robot, msgtype: 'markdown', markdown: { title: message.title, text: message.text } });
            if (receipt.ok !== true || receipt.robot !== route.robot) throw Object.assign(new Error('Invalid send receipt'), { code: 'BAAS_DINGTALK_INVALID_RECEIPT' });
            record.status = 'sent'; result.sent++;
          } catch (error) {
            record.status = 'failed'; record.code = /^[A-Z0-9_]+$/.test(error.code || '') ? error.code : 'BAAS_DINGTALK_SEND_FAILED'; result.failed++;
          }
          record.finishedAt = new Date(now()).toISOString();
          await fs.writeFile(journal, JSON.stringify(record), { mode: 0o600 });
          await repo.query('INSERT INTO po_audit_events (id,game_id,source_id,account_id,actor_type,event_type,outcome,detail) VALUES (?,?,?,?,?,?,?,?)', [crypto.randomUUID(), run.game_id, run.source_id, run.account_id, 'system', 'baas_dingtalk_collection_delivery', record.status === 'sent' ? 'success' : 'failed', JSON.stringify(record)]);
          await pause(3500);
          if (result.sent + result.failed >= 100) return result;
        }
        if (reasonPending || hasPendingAnalysis) { result.waiting++; continue; }
        await fs.writeFile(runFile, JSON.stringify({ runId: run.id, deliveryVersion: DELIVERY_CONTRACT_VERSION, status: 'settled', analysisFailed: failed, finishedAt: new Date(now()).toISOString() }), { mode: 0o600 }); result.completedRuns++;
      }
      if (runs.length < 100) break;
    }
  }
  }
  return result;
}
module.exports = { dispatchCollections, messages, notificationWindow, deliveryDate };
