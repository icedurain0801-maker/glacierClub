require('dotenv').config();
const assert = require('assert');
const http = require('http');
const app = require('../src/app');
const llm = require('../src/services/llm');
const embedding = require('../src/services/embedding');
const vectorStore = require('../src/services/vectorStore');

const PORT = process.env.CHAT_TEST_PORT || 3197;

// 假 LLM:回声形式,便于断言
llm._setImpl(async messages => {
  const last = messages[messages.length - 1];
  return { content: '回声:' + last.content };
});

// 假 embedding(与 kb.run.js 一致的确定性伪向量)
function fakeEmbed(text, dim = 64) {
  const v = new Array(dim).fill(0);
  for (let i = 0; i < text.length; i++) v[i % dim] += (text.charCodeAt(i) % 97) / 97;
  const norm = Math.sqrt(v.reduce((s, x) => s + x*x, 0)) || 1;
  return v.map(x => x / norm);
}
embedding._setImpl(async texts => texts.map(t => fakeEmbed(t)));

function req(method, urlPath, { token, versionId, body } = {}) {
  return new Promise((resolve, reject) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (versionId) headers['X-Version-Id'] = String(versionId);
    const data = body ? JSON.stringify(body) : null;
    if (data) headers['Content-Length'] = Buffer.byteLength(data);
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

async function main() {
  const server = app.listen(PORT);
  await vectorStore.loadAll();
  let passed = 0;
  const test = async (name, fn) => { await fn(); console.log(`  ✓ ${name}`); passed++; };

  try {
    // 登录
    const adminUser = process.env.SUPER_ADMIN_USERNAME || 'admin';
    const adminPass = process.env.SUPER_ADMIN_PASSWORD || 'Admin123!';
    const login = await req('POST', '/api/auth/login', { body: { username: adminUser, password: adminPass } });
    assert.strictEqual(login.status, 200);
    const token = login.body.token;

    const me = await req('GET', '/api/auth/me', { token });
    const v1 = me.body.versions[0].id;
    const v2 = me.body.versions[1] ? me.body.versions[1].id : v1;

    // 1) B 端保存机器人配置
    await test('PUT /api/bot 保存', async () => {
      const r = await req('PUT', '/api/bot', {
        token, versionId: v1,
        body: {
          persona: '你是妲己陪玩助手',
          welcome: '亲爱的~今天想聊什么呢?',
          ragEnabled: true, ragTopK: 3, historyTurns: 5,
        },
      });
      assert.strictEqual(r.status, 200);
    });

    await test('GET /api/bot 读回', async () => {
      const r = await req('GET', '/api/bot', { token, versionId: v1 });
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.body.persona, '你是妲己陪玩助手');
      assert.strictEqual(r.body.ragTopK, 3);
    });

    // 2) C 端 /api/public/bot
    await test('C 端 GET /api/public/bot', async () => {
      const r = await req('GET', `/api/public/bot?versionId=${v1}`);
      assert.strictEqual(r.status, 200);
      assert.ok(r.body.welcome.includes('亲爱的'));
    });

    // 3) C 端第一次对话
    const key1 = 'session_test_' + Date.now();
    await test('C 端 chat 第一次:建 session + 存消息', async () => {
      const r = await req('POST', '/api/public/chat', {
        body: { versionId: v1, sessionKey: key1, message: '你好' },
      });
      assert.strictEqual(r.status, 200);
      assert.ok(r.body.reply.includes('回声'));
    });

    // 4) 同 sessionKey 再来
    await test('C 端 chat 第二次:历史累积', async () => {
      const r = await req('POST', '/api/public/chat', {
        body: { versionId: v1, sessionKey: key1, message: '再见' },
      });
      assert.strictEqual(r.status, 200);
      const h = await req('GET', `/api/public/history?versionId=${v1}&sessionKey=${key1}`);
      assert.strictEqual(h.body.messages.length, 4);  // 2 轮 = 4 条
    });

    // 5) B 端会话列表看到
    await test('B 端 GET /api/sessions', async () => {
      const r = await req('GET', '/api/sessions', { token, versionId: v1 });
      assert.strictEqual(r.status, 200);
      assert.ok(r.body.some(s => s.session_key === key1));
    });

    // 6) B 端会话详情
    await test('B 端 GET /api/sessions/:id 拿全部消息', async () => {
      const list = await req('GET', '/api/sessions', { token, versionId: v1 });
      const sid = list.body.find(s => s.session_key === key1).id;
      const r = await req('GET', `/api/sessions/${sid}`, { token, versionId: v1 });
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.body.messages.length, 4);
    });

    // 7) 版本隔离:同 sessionKey 在 v2 建新 session
    if (v2 !== v1) {
      await test('版本隔离:v2 同 sessionKey 建新 session', async () => {
        const r = await req('POST', '/api/public/chat', {
          body: { versionId: v2, sessionKey: key1, message: '在 v2 说话' },
        });
        assert.strictEqual(r.status, 200);
        const h = await req('GET', `/api/public/history?versionId=${v2}&sessionKey=${key1}`);
        assert.strictEqual(h.body.messages.length, 2);  // 只这一轮
      });
    }

    // 8) LLM 失败时回滚 user message
    await test('LLM 失败回滚 user message', async () => {
      llm._setImpl(async () => { throw new Error('mock LLM 挂了'); });
      const key2 = 'session_fail_' + Date.now();
      const before = await req('GET', `/api/public/history?versionId=${v1}&sessionKey=${key2}`);
      assert.strictEqual(before.body.messages.length, 0);
      const r = await req('POST', '/api/public/chat', {
        body: { versionId: v1, sessionKey: key2, message: '会失败的消息' },
      });
      assert.strictEqual(r.status, 500);
      const after = await req('GET', `/api/public/history?versionId=${v1}&sessionKey=${key2}`);
      assert.strictEqual(after.body.messages.length, 0, 'user message 应被回滚');
      // 恢复回声实现
      llm._setImpl(async messages => ({ content: '回声:' + messages[messages.length - 1].content }));
    });

    // 9) message 空返回 400
    await test('message 空 400', async () => {
      const r = await req('POST', '/api/public/chat', {
        body: { versionId: v1, sessionKey: 'x', message: '' },
      });
      assert.strictEqual(r.status, 400);
    });

    // 10) versionId 不存在 404
    await test('versionId 不存在 404', async () => {
      const r = await req('POST', '/api/public/chat', {
        body: { versionId: 999999, sessionKey: 'x', message: 'hi' },
      });
      assert.strictEqual(r.status, 404);
    });

    console.log(`\n${passed} 个测试全部通过`);
  } catch (err) {
    console.error('\n✗ 测试失败:', err.stack || err.message);
    process.exitCode = 1;
  } finally {
    server.close();
  }
}

main();
