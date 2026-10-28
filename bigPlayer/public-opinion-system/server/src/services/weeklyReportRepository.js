const { weeklyWindow, sqlDate, chunks, reportStats } = require('../../../shared/weeklyReport');
const parse = value => typeof value === 'string' ? JSON.parse(value) : value;
class WeeklyReportRepository {
  constructor(repo) { this.repo = repo; }
  async latest(communityId, now = new Date()) {
    const window = weeklyWindow(now);
    const rows = await this.repo.query('SELECT community_name,week_start,week_end,status,stats,summary,generated_at,scheduled_at FROM po_weekly_reports WHERE community_id=? AND week_start=? LIMIT 1', [communityId, sqlDate(window.start)]);
    const row = rows[0];
    const [eligible] = await this.repo.query(`SELECT EXISTS(SELECT 1 FROM po_sources s WHERE s.community_id=? AND (JSON_EXTRACT(s.config,'$.deleted') IS NULL OR JSON_EXTRACT(s.config,'$.deleted')=false)) AS has_source,EXISTS(SELECT 1 FROM po_contents c WHERE c.community_id=? AND c.published_at>=? AND c.published_at<?) AS has_content`, [communityId, communityId, sqlDate(window.start), sqlDate(window.end)]);
    if (!Number(eligible.has_source) || !Number(eligible.has_content)) return { status: 'not_applicable', week_start: window.start.toISOString(), week_end: window.end.toISOString() };
    return row ? { ...row, stats: parse(row.stats) } : { status: now < window.due ? 'scheduled' : 'pending', week_start: window.start.toISOString(), week_end: window.end.toISOString(), scheduled_at: window.due.toISOString() };
  }
  async enqueue(conn, now) {
    const window = weeklyWindow(now);
    if (now < window.due) return;
    await conn.query(`INSERT IGNORE INTO po_weekly_reports (id,community_id,community_name,week_start,week_end,scheduled_at,created_at,updated_at)
      SELECT UUID(),c.id,c.name,?,?,?,UTC_TIMESTAMP(),UTC_TIMESTAMP() FROM po_communities c JOIN po_games g ON g.id=c.game_id WHERE c.status='enabled' AND g.enabled=1
      AND EXISTS(SELECT 1 FROM po_sources s WHERE s.community_id=c.id AND (JSON_EXTRACT(s.config,'$.deleted') IS NULL OR JSON_EXTRACT(s.config,'$.deleted')=false))
      AND EXISTS(SELECT 1 FROM po_contents content WHERE content.community_id=c.id AND content.published_at>=? AND content.published_at<?)`, [sqlDate(window.start), sqlDate(window.end), sqlDate(window.due), sqlDate(window.start), sqlDate(window.end)]);
  }
  async snapshot(conn, report) {
    // Consistent transaction snapshot freezes all raw text and its actual analysis coverage.
    await conn.beginTransaction();
    try {
      const [rows] = await conn.query(`SELECT c.id,c.content_type,c.title,c.body,c.published_at,
        CASE WHEN a.content_fingerprint=c.fingerprint THEN a.sentiment ELSE NULL END AS sentiment
        FROM po_contents c LEFT JOIN po_analyses a ON a.content_id=c.id
        WHERE c.community_id=? AND c.published_at>=? AND c.published_at<? ORDER BY c.published_at,c.id`, [report.community_id, report.week_start, report.week_end]);
      // URLs are references, not readable image evidence. Keep every original
      // textual contribution while excluding opaque media URLs from AI input.
      const text = value => String(value || '').replace(/https?:\/\/[^\s"<>]+/gi, '[链接或图片，内容不可见]').replace(/\\n/g, '\n');
      const inputs = chunks(rows.map(row => JSON.stringify({ type: row.content_type, title: text(row.title), body: text(row.body) })));
      for (let i = 0; i < inputs.length; i++) await conn.query('INSERT INTO po_weekly_report_parts (report_id,merge_level,sequence_no,input_text) VALUES (?,0,?,?)', [report.id, i, inputs[i]]);
      const stats = reportStats(rows);
      await conn.query("UPDATE po_weekly_reports SET snapshot_ready=1,stats=?,status=?,summary=?,generated_at=IF(?=0,UTC_TIMESTAMP(),NULL),updated_at=UTC_TIMESTAMP() WHERE id=?", [JSON.stringify(stats), rows.length ? 'running' : 'completed', rows.length ? null : '本统计周暂无抓取内容，暂无法形成社区运营总结。', rows.length, report.id]);
      await conn.commit();
      return { ...report, snapshot_ready: 1, stats, status: rows.length ? 'running' : 'completed' };
    } catch (error) { await conn.rollback(); throw error; }
  }
}
module.exports = { WeeklyReportRepository };
