const test = require('node:test');
const assert = require('node:assert/strict');
const { weeklyWindow, sqlDate, chunks, reportStats } = require('../../shared/weeklyReport');
const { WeeklyReportRepository } = require('../../server/src/services/weeklyReportRepository');
const { WeeklyReportRunner, summarize } = require('../src/weeklyReportRunner');

test('北京时间跨周及周一9:30边界', () => {
  const window = weeklyWindow(new Date('2026-10-19T09:30:00+08:00'));
  assert.equal(sqlDate(window.start), '2026-10-11 16:00:00');
  assert.equal(sqlDate(window.end), '2026-10-18 16:00:00');
  assert.equal(window.due.toISOString(), '2026-10-19T01:30:00.000Z');
  assert.equal(weeklyWindow(new Date('2026-10-18T23:59:59+08:00')).end.toISOString(), '2026-10-11T16:00:00.000Z');
});
test('全部长内容分块覆盖，不损坏Unicode或丢弃末尾', () => {
  const text = '评论内容😀'.repeat(4000) + '最后一条';
  const parts = chunks([text], 1000);
  assert.equal(parts.join(''), text);
  assert.ok(parts.every(part => !/[\uD800-\uDBFF]$/.test(part)));
});
test('情绪比例以有效分析为分母并明确未分析量', () => {
  assert.deepEqual(reportStats([{ sentiment: 'positive' }, { sentiment: 'negative' }, { sentiment: null }]), { total: 3, positive: 1, negative: 1, neutral: 0, unclassified: 1, analyzed: 2, positiveRate: 50 });
  assert.equal(reportStats([{ sentiment: null }]).positiveRate, null);
});
test('周一9:30之前不入队；入队社区+周唯一，不扫描历史积压', async () => {
  const calls = [];
  const store = new WeeklyReportRepository({});
  const conn = { query: async (...args) => calls.push(args) };
  await store.enqueue(conn, new Date('2026-10-19T09:29:59+08:00'));
  assert.equal(calls.length, 0);
  await store.enqueue(conn, new Date('2026-10-19T09:30:00+08:00'));
  assert.match(calls[0][0], /INSERT IGNORE/);
  assert.deepEqual(calls[0][1], ['2026-10-11 16:00:00', '2026-10-18 16:00:00', '2026-10-19 01:30:00', '2026-10-11 16:00:00', '2026-10-18 16:00:00']);
  assert.match(calls[0][0], /EXISTS\(SELECT 1 FROM po_sources/);
  assert.match(calls[0][0], /EXISTS\(SELECT 1 FROM po_contents/);
});
test('并发进程拿不到全局锁时不调用AI并释放连接', async () => {
  let calls = 0, released = false;
  const conn = { query: async () => { calls++; return [[{ acquired: 0 }]]; }, release: () => { released = true; } };
  await new WeeklyReportRunner({ pool: { getConnection: async () => conn } }, { callOnce: () => { throw Error('must not call'); } }).tick();
  assert.equal(calls, 1); assert.equal(released, true);
});
test('失败仅重试当前分块，成功块不重复AI；释放全局锁', async () => {
  const sqls = [];
  const report = { id: 'r', community_id: 'c', snapshot_ready: 1, merge_level: 0, status: 'running' };
  const conn = { query: async (sql, args) => {
    sqls.push([sql, args]);
    if (sql.includes('GET_LOCK')) return [[{ acquired: 1 }]];
    if (sql.includes('SELECT * FROM po_weekly_reports')) return [[report]];
    if (sql.includes('SELECT * FROM po_weekly_report_parts')) return [[{ summary: '已完成', sequence_no: 0 }, { input_text: '末条原文', sequence_no: 1 }]];
    return [{}];
  }, release() {} };
  const ai = { requireConfigured() {}, api: 'openai-chat-completions', async callOnce(messages) { assert.equal(messages[1].content, '末条原文'); throw Object.assign(Error('timeout'), { code: 'AI_TIMEOUT' }); } };
  await new WeeklyReportRunner({ pool: { getConnection: async () => conn } }, ai, () => new Date('2026-10-19T10:00:00+08:00')).tick();
  assert.ok(sqls.some(([sql]) => sql.includes("status=IF(attempts>=4,'failed','retryable')")));
  assert.ok(sqls.some(([sql]) => sql.includes('RELEASE_LOCK')));
});
test('截断和过长AI响应不得作为已完成周报', async () => {
  const ai = { requireConfigured() {}, api: 'openai-chat-completions', callOnce: async () => ({ choices: [{ message: { content: '不完整摘要' }, finish_reason: 'length' }] }) };
  await assert.rejects(summarize(ai, '原文'), { code: 'WEEKLY_AI_INVALID_RESPONSE' });
});
