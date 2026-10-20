// Explicit --apply changes topics only. --sync uses the existing serialized BaaS writer.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { TypeSafeTopicAnalyzer } = require('../server/src/integrations/typeSafeTopicAnalyzer');
const { analysisText } = require('../server/src/services/urgentValidation');
const { TOPIC_VERSION, topicQuestion } = require('../server/src/services/topicDecision');
const { Repository } = require('../server/src/db/repository');
const { BaasClient, readToken } = require('../server/src/services/baasDataClient');
const { syncPage, saveState } = require('../worker/src/baasLiveWriter');
const ROOT = path.join(process.env.ProgramData || 'C:/ProgramData', 'PublicOpinion');
const STATE_FILE = path.join(ROOT, 'data/baas-live/state.json');
const OUT = path.join(ROOT, 'data/topic-backfill', TOPIC_VERSION);
const parse = value => { try { return typeof value === 'string' ? JSON.parse(value) : value; } catch { return null; } };
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function needsTopic(value) { const topics = parse(value); return !Array.isArray(topics) || !topics.length || topics.some(topic => ['其他', '议题待补判'].includes(topic)); }
function invariant(row) { const { topics, ...rest } = row; return digest(rest); }
function decisionKey(row) { return digest({ version: TOPIC_VERSION, prompt: topicQuestion().instructions, community: row.community_id, game: row.game_id, text: analysisText(row), emptyMedia: Boolean(parse(row.media)?.length) }); }
function needsRefinement(value) { const topics = parse(value); return Array.isArray(topics) && topics.some(topic => ['文字不足', '图片分享·文字不足'].includes(topic)); }
async function updateTopic(repo, row, decision, backup, eligible = needsTopic, lockWaitSeconds = null) {
  const conn = await repo.pool.getConnection();
  try {
    // Only the dedicated repair pool supplies this session-local timeout.
    if (lockWaitSeconds !== null) {
      if (!Number.isInteger(lockWaitSeconds) || lockWaitSeconds < 1 || lockWaitSeconds > 10) throw new Error('Invalid repair lock timeout');
      await conn.query('SET SESSION innodb_lock_wait_timeout=?', [lockWaitSeconds]);
    }
    await conn.beginTransaction();
    const [contents] = await conn.query('SELECT fingerprint FROM po_contents WHERE id=? LOCK IN SHARE MODE', [row.content_id]);
    const [analyses] = await conn.query('SELECT * FROM po_analyses WHERE id=? FOR UPDATE', [row.id]);
    const current = analyses[0];
    if (!current || !contents[0] || contents[0].fingerprint !== row.fingerprint || !eligible(current.topics) || current.content_fingerprint && current.content_fingerprint !== row.fingerprint) { await conn.rollback(); return false; }
    const before = invariant(current);
    if (JSON.stringify(parse(current.topics)) === JSON.stringify(decision.topics)) { await conn.rollback(); return false; }
    backup({ analysisId: row.id, contentId: row.content_id, previousTopics: current.topics, nextTopics: decision.topics, invariantHash: before });
    await conn.query('UPDATE po_analyses SET topics=? WHERE id=?', [JSON.stringify(decision.topics), row.id]);
    const [after] = await conn.query('SELECT * FROM po_analyses WHERE id=?', [row.id]);
    if (invariant(after[0]) !== before) throw Object.assign(new Error('Non-topic analysis fields changed'), { code: 'TOPIC_INVARIANT_VIOLATION' });
    await conn.query('INSERT INTO po_audit_events (id,game_id,source_id,account_id,actor_type,event_type,outcome,detail) VALUES (?,?,?,?,?,?,?,?)', [crypto.randomUUID(), row.game_id, row.source_id, row.account_id, 'system', 'analysis_topic_backfilled', 'success', JSON.stringify({ contentId: row.content_id, analysisId: row.id, version: TOPIC_VERSION, topics: decision.topics, confidence: decision.confidence, sourceHash: digest(analysisText(row)), invariantHash: before })]);
    await conn.commit(); return true;
  } catch (error) { await conn.rollback(); throw error; } finally { conn.release(); }
}
async function synchronize(repo, ids) {
  if (!ids.length) return { written: 0 };
  const lock = await repo.pool.getConnection();
  try {
    const [rows] = await lock.query("SELECT GET_LOCK('po_baas_live_writer',30) acquired");
    if (!Number(rows[0].acquired)) throw Object.assign(new Error('Cloud writer busy'), { code: 'TOPIC_SYNC_BUSY' });
    const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    const client = new BaasClient(readToken(path.join(ROOT, 'config/baas-data-token.dpapi')));
    const request = client.request.bind(client);
    let startQueue = Promise.resolve(), nextStart = 0, interval = 100, cooldown = 0;
    client.request = async (...args) => {
      for (let attempt = 0; attempt < 8; attempt++) {
        const turn = startQueue.then(async () => {
          const wait = Math.max(nextStart, cooldown) - Date.now();
          if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
          nextStart = Date.now() + interval;
        });
        startQueue = turn.catch(() => {}); await turn;
        try { return await request(...args); }
        catch (error) {
          if (attempt === 7 || ![429, 500, 502, 503, 504].includes(error.status) && !['BAAS_TIMEOUT', 'ECONNRESET', 'ETIMEDOUT'].includes(error.code)) throw error;
          if (error.status === 429) {
            interval = Math.min(1000, Math.round(interval * 1.25));
            cooldown = Math.max(cooldown, Date.now() + Math.min(30000, 2000 * 2 ** attempt));
          } else await new Promise(resolve => setTimeout(resolve, Math.min(10000, 500 * 2 ** attempt)));
        }
      }
    };
    await client.verify();
    // These IDs were already acknowledged by the normal writer. Patch them directly
    // to avoid a redundant create/409 round trip; preserve the normal writer fallback.
    const createOrPut = client.put.bind(client);
    client.put = async (id, data) => {
      for (let attempt = 0; attempt < 4; attempt++) {
        try { return await client.request('PATCH', `v1/collections/po_live_contents_v1/docs/${encodeURIComponent(id)}`, { data, merge: false, reason: 'Approved topic-only analysis backfill' }); }
        catch (error) {
          if (error.status === 404) return createOrPut(id, data);
          if (attempt === 3 || ![429, 500, 502, 503, 504].includes(error.status) && !['BAAS_TIMEOUT', 'ECONNRESET', 'ETIMEDOUT'].includes(error.code)) throw error;
          await new Promise(resolve => setTimeout(resolve, 500 * 2 ** attempt));
        }
      }
    };
    let position = 0, written = 0;
    try {
      const results = await Promise.allSettled(Array.from({ length: 8 }, async () => {
        while (position < ids.length) {
          const selected = ids.slice(position, position += 50);
          const result = await syncPage({ repo, client, state: { ...state, cursor: '' }, contentIds: selected, limit: 50, save: async () => {} });
          written += result.written;
          saveState(STATE_FILE, state);
          console.log(JSON.stringify({ stage: 'cloud-progress', written, total: ids.length }));
        }
      }));
      const failed = results.find(result => result.status === 'rejected');
      if (failed) throw failed.reason;
    } finally { saveState(STATE_FILE, state); }
    return { written };
  } finally { try { await lock.query("SELECT RELEASE_LOCK('po_baas_live_writer')"); } finally { lock.release(); } }
}
async function main() {
  require('../server/src/runtimeEnv').loadRuntimeEnv();
  const repo = new Repository();
  fs.mkdirSync(OUT, { recursive: true });
  const prefix = process.argv.includes('--refine') ? 'refine-' : '';
  const reportFile = path.join(OUT, `${prefix}status.json`), cacheFile = path.join(OUT, `${prefix}decisions.json`);
  const previous = fs.existsSync(reportFile) ? JSON.parse(fs.readFileSync(reportFile)) : {};
  const decisions = fs.existsSync(cacheFile) ? JSON.parse(fs.readFileSync(cacheFile)) : {};
  const report = { startedAt: new Date().toISOString(), version: TOPIC_VERSION, status: 'scanning', total: 0, classified: 0, updated: 0, skipped: 0, calls: 0, failed: [], changedIds: previous.changedIds || [] };
  const backupFile = path.join(OUT, 'before-topics.jsonl');
  if (fs.existsSync(backupFile)) {
    report.changedIds = [...new Set([...report.changedIds, ...fs.readFileSync(backupFile, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line).contentId)])];
  }
  const save = () => { saveState(reportFile, report); saveState(cacheFile, decisions); };
  try {
    const ids = Object.keys(JSON.parse(fs.readFileSync(STATE_FILE)).hashes);
    let rows = [];
    for (let offset = 0; offset < ids.length; offset += 300) {
      const selected = ids.slice(offset, offset + 300);
      rows.push(...await repo.query(`SELECT a.id,a.content_id,a.topics,a.content_fingerprint,c.fingerprint,c.title,c.body,c.media,c.content_type,c.published_at,c.game_id,c.community_id,c.source_id,c.account_id,g.name game_name,co.name community_name FROM po_analyses a JOIN po_contents c ON c.id=a.content_id LEFT JOIN po_games g ON g.id=c.game_id LEFT JOIN po_communities co ON co.id=c.community_id WHERE c.id IN (${selected.map(() => '?').join(',')}) AND c.is_deleted=0`, selected));
    }
    const eligible = process.argv.includes('--refine') ? needsRefinement : needsTopic;
    rows = rows.filter(row => eligible(row.topics) && (!row.content_fingerprint || row.content_fingerprint === row.fingerprint));
    const limitArg = process.argv.find(arg => arg.startsWith('--limit='));
    if (limitArg) rows = rows.slice(0, Math.max(0, Number(limitArg.split('=')[1]) || 0));
    // Today first so users see the current chart recover while historical data follows.
    rows.sort((a, b) => (a.community_name === '超能世界国服版' ? -1 : 1) - (b.community_name === '超能世界国服版' ? -1 : 1) || String(b.published_at).localeCompare(String(a.published_at)));
    const groups = new Map(); for (const row of rows) { const key = decisionKey(row); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(row); }
    report.total = rows.length; report.unique = groups.size;
    console.log(JSON.stringify({ stage: 'scope', total: report.total, unique: report.unique, apply: process.argv.includes('--apply') }));
    if (!process.argv.includes('--apply')) return;
    report.status = 'classifying'; save();
    const ai = new TypeSafeTopicAnalyzer(), entries = [...groups.entries()];
    const backup = value => fs.appendFileSync(backupFile, JSON.stringify(value) + '\n');
    let position = 0;
    await Promise.all(Array.from({ length: 8 }, async () => {
      while (position < entries.length) {
        const batch = entries.slice(position, position += 10);
        const missing = batch.filter(([key]) => !decisions[key]);
        if (missing.length) {
          try {
            report.calls++;
            const results = await ai.classify(missing.map(([, records]) => records[0]));
            missing.forEach(([key], index) => { decisions[key] = results[index]; });
          } catch (error) {
            report.failed.push(...missing.flatMap(([, records]) => records.map(row => ({ analysisId: row.id, code: error.code || 'TOPIC_CLASSIFY_FAILED' }))));
            save(); continue;
          }
        }
        for (const [key, records] of batch) for (const row of records) {
          if (!decisions[key]) continue;
          report.classified++;
          try {
            if (await updateTopic(repo, row, decisions[key], backup, eligible)) { report.updated++; if (!report.changedIds.includes(row.content_id)) report.changedIds.push(row.content_id); }
            else report.skipped++;
          } catch (error) { report.failed.push({ analysisId: row.id, code: error.code || 'TOPIC_UPDATE_FAILED' }); }
        }
        save();
        console.log(JSON.stringify({ stage: 'progress', classified: report.classified, updated: report.updated, failed: report.failed.length, total: report.total }));
      }
    }));
    if (process.argv.includes('--sync')) {
      report.status = 'syncing'; save();
      report.cloud = await synchronize(repo, report.changedIds);
    }
    report.status = report.failed.length ? 'partial' : 'completed'; report.finishedAt = new Date().toISOString(); save();
    console.log(JSON.stringify({ stage: 'finished', ...report, changedIds: report.changedIds.length }));
  } catch (error) { report.status = 'failed'; report.error = error.code || 'TOPIC_BACKFILL_FAILED'; save(); throw error; }
  finally { await repo.pool.end(); }
}
if (require.main === module) main().catch(error => { console.error(error.code || 'TOPIC_BACKFILL_FAILED'); process.exitCode = 1; });
module.exports = { needsTopic, invariant, decisionKey, updateTopic, synchronize };
