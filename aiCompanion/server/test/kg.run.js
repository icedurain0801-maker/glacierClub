// KG(知识图谱×RAG) 集成测试。运行：node test/kg.run.js
// 覆盖：含别名列的导入 → 别名/条目关联落库 → 实体识别 → 图谱事实注入 prompt →
//       截断优先级(persona>图谱>参考知识) → refs 扩展 → B 端别名 CRUD。
require('dotenv').config();
const assert = require('assert');
const http = require('http');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const app = require('../src/app');
const db = require('../src/config/db');
const llm = require('../src/services/llm');
const embedding = require('../src/services/embedding');
const vectorStore = require('../src/services/vectorStore');
const ingestWorker = require('../src/services/ingestWorker');
const kgContext = require('../src/services/kgContext');
const chatService = require('../src/services/chatService');

const PORT = process.env.KG_TEST_PORT || 3196;

// 假 LLM:记录收到的 messages 便于断言 prompt 内容
let lastMessages = null;
llm._setImpl(async messages => {
  lastMessages = messages;
  return { content: '回声:' + messages[messages.length - 1].content };
});

// 假 embedding(确定性伪向量)
function fakeEmbed(text, dim = 64) {
  const v = new Array(dim).fill(0);
  for (let i = 0; i < text.length; i++) v[i % dim] += (text.charCodeAt(i) % 97) / 97;
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map(x => x / norm);
}
embedding._setImpl(async texts => texts.map(t => fakeEmbed(t)));

function req(method, urlPath, { token, versionId, body, form } = {}) {
  return new Promise((resolve, reject) => {
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (versionId) headers['X-Version-Id'] = String(versionId);
    let data;
    if (form) {
      const boundary = '----kgtest' + Date.now();
      headers['Content-Type'] = `multipart/form-data; boundary=${boundary}`;
      const parts = [];
      for (const [k, v] of Object.entries(form.fields || {})) {
        parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`);
      }
      if (form.file) {
        parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="${form.file.name}"; filename="${form.file.filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`);
      }
      const head = Buffer.from(parts.join(''), 'utf8');
      const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
      data = Buffer.concat(form.file ? [head, form.file.buffer, tail] : [head, tail]);
      headers['Content-Length'] = data.length;
    } else if (body) {
      data = JSON.stringify(body);
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(data);
    }
    const r = http.request({ host: '127.0.0.1', port: PORT, method, path: urlPath, headers }, res => {
      let buf = '';
      res.on('data', c => (buf += c));
      res.on('end', () => resolve({ status: res.statusCode, body: buf ? tryJson(buf) : null }));
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}
function tryJson(s) { try { return JSON.parse(s); } catch { return s; } }

// 含「别名」列的样本
function makeSample() {
  const rows = [
    ['英雄', '别名', '定位', '克制'],
    ['大乔', '乔妹,大桥', '辅助', '妲己'],
    ['妲己', '小狐狸', '法师', '大乔'],
    ['后羿', '', '射手', '妲己'],
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'heroes');
  const out = path.join(__dirname, 'fixtures', 'kg_sample.xlsx');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  XLSX.writeFile(wb, out);
  return out;
}

async function main() {
  const server = app.listen(PORT);
  await vectorStore.loadAll();
  let passed = 0;
  const test = async (name, fn) => { await fn(); console.log(`  ✓ ${name}`); passed++; };

  try {
    const adminUser = process.env.SUPER_ADMIN_USERNAME || 'admin';
    const adminPass = process.env.SUPER_ADMIN_PASSWORD || 'Admin123!';
    const login = await req('POST', '/api/auth/login', { body: { username: adminUser, password: adminPass } });
    assert.strictEqual(login.status, 200);
    const token = login.body.token;
    const me = await req('GET', '/api/auth/me', { token });
    const v1 = me.body.versions[0].id;

    // 清掉该版本旧数据，保证可重复跑
    await db.query('DELETE FROM kb_documents WHERE version_id=?', [v1]);
    await db.query('DELETE FROM chat_sessions WHERE version_id=?', [v1]);
    kgContext.invalidate(v1);

    // —— 导入含别名列的样本 ——
    const fileBuf = fs.readFileSync(makeSample());
    let documentId;
    await test('导入含别名列的样本', async () => {
      const init = await req('POST', '/api/kb/uploads/init', {
        token, versionId: v1, body: { name: 'kg_sample.xlsx', size: fileBuf.length, totalChunks: 1 },
      });
      assert.strictEqual(init.status, 201);
      const up = await req('POST', `/api/kb/uploads/${init.body.uploadId}/chunk`, {
        token, versionId: v1,
        form: { fields: { index: '0' }, file: { name: 'chunk', filename: 'c0', buffer: fileBuf } },
      });
      assert.strictEqual(up.status, 200);
      const done = await req('POST', `/api/kb/uploads/${init.body.uploadId}/complete`, { token, versionId: v1, body: {} });
      assert.strictEqual(done.status, 201);
      documentId = done.body.documentId;
      // 手动驱动 worker 直到 job 完成
      for (let i = 0; i < 20; i++) {
        await ingestWorker.tick();
        const j = await req('GET', `/api/kb/jobs/${done.body.jobId}`, { token, versionId: v1 });
        if (j.body.status === 'done') return;
        if (j.body.status === 'failed') throw new Error('ingest failed: ' + j.body.error);
      }
      throw new Error('ingest 超时');
    });

    await test('别名落库(主名+别名列)', async () => {
      const [rows] = await db.query('SELECT alias FROM kb_entity_aliases WHERE version_id=?', [v1]);
      const aliases = rows.map(r => r.alias);
      assert.ok(aliases.includes('大乔'), '主名应写入别名表');
      assert.ok(aliases.includes('乔妹'), '别名列应切分写入');
      assert.ok(aliases.includes('小狐狸'));
    });

    await test('条目-实体关联落库', async () => {
      const [rows] = await db.query(
        `SELECT COUNT(*) AS n FROM kb_entry_entities ee
           JOIN knowledge_entries e ON e.id = ee.entry_id WHERE e.version_id=?`, [v1]);
      assert.ok(rows[0].n >= 3, `应至少 3 条关联,实际 ${rows[0].n}`);
    });

    await test('实体识别:别名命中 + 最长优先', async () => {
      const linked = await kgContext.linkEntities(v1, '乔妹被谁克制?');
      assert.strictEqual(linked.length, 1);
      assert.strictEqual(linked[0].alias, '乔妹');
      // "大乔"整词优先于任何子串
      const linked2 = await kgContext.linkEntities(v1, '大乔和妲己谁强');
      const names = linked2.map(l => l.alias).sort();
      assert.deepStrictEqual(names, ['大乔', '妲己']);
    });

    await test('一跳事实:出边+入边+属性', async () => {
      const linked = await kgContext.linkEntities(v1, '乔妹');
      const facts = await kgContext.getFacts(v1, linked.map(l => l.entityId));
      const texts = facts.map(f => f.text).join('\n');
      assert.ok(texts.includes('大乔 —克制→ 妲己'), '应有出边: ' + texts);
      assert.ok(texts.includes('妲己 —克制→ 大乔'), '应有入边: ' + texts);
      assert.ok(texts.includes('大乔 属性:'), '应有属性摘要: ' + texts);
    });

    // —— C 端 chat:图谱事实注入 + refs 扩展 ——
    await test('chat 注入图谱事实且 refs 含 fact', async () => {
      lastMessages = null;
      const r = await req('POST', '/api/public/chat', {
        body: { versionId: v1, sessionKey: 'kg-test-1', message: '乔妹被谁克制?' },
      });
      assert.strictEqual(r.status, 200);
      assert.ok(lastMessages, 'LLM 应被调用');
      const sys = lastMessages[0].content;
      assert.ok(sys.includes('【图谱事实】'), 'system 应含图谱块');
      assert.ok(sys.includes('妲己 —克制→ 大乔'), 'system 应含入边事实');
      const factRefs = r.body.refs.filter(x => x.type === 'fact');
      assert.ok(factRefs.length > 0, 'refs 应含 fact 元素');
      const entryRefs = r.body.refs.filter(x => x.entryId);
      assert.ok(entryRefs.length > 0, 'refs 应仍含向量召回元素');
    });

    await test('截断优先级:persona > 图谱 > 参考知识', async () => {
      const bot = { persona: 'P'.repeat(100), rag_enabled: 1, rag_top_k: 5, kg_enabled: 1, history_turns: 10, model: null };
      const factBlock = '\n【图谱事实】\n- ' + 'F'.repeat(200);
      const contextBlock = '\n参考知识:\n' + 'C'.repeat(9000);  // 超预算(8K)
      const msgs = chatService.buildMessages(bot, [], 'hi', contextBlock, factBlock);
      const sys = msgs[0].content;
      assert.ok(sys.startsWith('P'.repeat(100)), 'persona 完整保留');
      assert.ok(sys.includes('F'.repeat(200)), '图谱事实完整保留');
      assert.ok(sys.includes('C'), '参考知识保留一部分');
      assert.ok(!sys.includes('C'.repeat(9000)), '参考知识被截断');
    });

    // —— B 端别名 CRUD ——
    let entityId, aliasId;
    await test('GET /api/kg/entities 返回实体+别名', async () => {
      const r = await req('GET', '/api/kg/entities?q=' + encodeURIComponent('大乔'), { token, versionId: v1 });
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.body.length, 1);
      entityId = r.body[0].id;
      const aliases = r.body[0].aliases.map(a => a.alias);
      assert.ok(aliases.includes('乔妹'));
    });

    await test('POST 手动别名 + 立即生效', async () => {
      const r = await req('POST', `/api/kg/entities/${entityId}/aliases`, {
        token, versionId: v1, body: { alias: '桥宝' },
      });
      assert.strictEqual(r.status, 201);
      aliasId = r.body.id;
      const linked = await kgContext.linkEntities(v1, '桥宝怎么玩');
      assert.strictEqual(linked.length, 1, '新别名应立即可识别(缓存已失效)');
    });

    await test('重复别名 409', async () => {
      const r = await req('POST', `/api/kg/entities/${entityId}/aliases`, {
        token, versionId: v1, body: { alias: '桥宝' },
      });
      assert.strictEqual(r.status, 409);
    });

    await test('DELETE 别名 + 立即失效', async () => {
      const r = await req('DELETE', `/api/kg/aliases/${aliasId}`, { token, versionId: v1 });
      assert.strictEqual(r.status, 200);
      const linked = await kgContext.linkEntities(v1, '桥宝怎么玩');
      assert.strictEqual(linked.length, 0, '删除后不应再识别');
    });

    await test('kg_enabled=0 不注入图谱', async () => {
      await db.query(
        `INSERT INTO bots (version_id, persona, welcome, kg_enabled) VALUES (?,?,?,0)
         ON DUPLICATE KEY UPDATE kg_enabled=0`,
        [v1, '测试助手', '你好']
      );
      lastMessages = null;
      const r = await req('POST', '/api/public/chat', {
        body: { versionId: v1, sessionKey: 'kg-test-2', message: '乔妹被谁克制?' },
      });
      assert.strictEqual(r.status, 200);
      assert.ok(!lastMessages[0].content.includes('【图谱事实】'), '关闭后 system 不应含图谱块');
      assert.strictEqual(r.body.refs.filter(x => x.type === 'fact').length, 0);
      await db.query('UPDATE bots SET kg_enabled=1 WHERE version_id=?', [v1]);
    });

    console.log(`\n${passed} 个测试全部通过`);
  } catch (err) {
    console.error('\n✗ 测试失败：', err.message);
    process.exitCode = 1;
  } finally {
    server.close();
    process.exit(process.exitCode || 0);
  }
}

main();
