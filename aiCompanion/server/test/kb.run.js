require('dotenv').config();
const assert = require('assert');
const http = require('http');
const fs = require('fs');
const path = require('path');
const app = require('../src/app');
const embedding = require('../src/services/embedding');
const vectorStore = require('../src/services/vectorStore');
const ingestWorker = require('../src/services/ingestWorker');

const PORT = process.env.KB_TEST_PORT || 3198;

// 假 embedding：把文本按字符 charCode 求和分散到固定维度，确定性
function fakeEmbed(text, dim = 64) {
  const v = new Array(dim).fill(0);
  for (let i = 0; i < text.length; i++) v[i % dim] += (text.charCodeAt(i) % 97) / 97;
  const norm = Math.sqrt(v.reduce((s, x) => s + x*x, 0)) || 1;
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
      const boundary = '----kbtest' + Date.now();
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

async function main() {
  const server = app.listen(PORT);
  await vectorStore.loadAll();
  let passed = 0;
  const test = async (name, fn) => { await fn(); console.log(`  ✓ ${name}`); passed++; };

  try {
    // 登录：用地基 seed 的超管
    const adminUser = process.env.SUPER_ADMIN_USERNAME || 'admin';
    const adminPass = process.env.SUPER_ADMIN_PASSWORD || 'Admin123!';
    const login = await req('POST', '/api/auth/login', { body: { username: adminUser, password: adminPass } });
    assert.strictEqual(login.status, 200);
    const token = login.body.token;

    // 拿两个版本
    const me = await req('GET', '/api/auth/me', { token });
    const v1 = me.body.versions[0].id;
    const v2 = me.body.versions[1] ? me.body.versions[1].id : v1;

    // 生成样本
    require('./fixtures/generate');
    const samplePath = path.join(__dirname, 'fixtures', 'sample.xlsx');
    const fileBuf = fs.readFileSync(samplePath);

    // 1) 分片上传（就切 2 片测试分片流程）
    let uploadId, documentId, jobId;
    await test('分片 init', async () => {
      const r = await req('POST', '/api/kb/uploads/init', {
        token, versionId: v1,
        body: { name: 'sample.xlsx', size: fileBuf.length, totalChunks: 2 },
      });
      assert.strictEqual(r.status, 201);
      uploadId = r.body.uploadId;
      assert.ok(uploadId);
    });

    const half = Math.floor(fileBuf.length / 2);
    const p1 = fileBuf.slice(0, half);
    const p2 = fileBuf.slice(half);

    await test('分片0上传', async () => {
      const r = await req('POST', `/api/kb/uploads/${uploadId}/chunk`, {
        token, versionId: v1,
        form: { fields: { index: '0' }, file: { name: 'chunk', filename: 'chunk0', buffer: p1 } },
      });
      assert.strictEqual(r.status, 200);
    });

    await test('缺片 complete 返回 400', async () => {
      const r = await req('POST', `/api/kb/uploads/${uploadId}/complete`, { token, versionId: v1, body: {} });
      assert.strictEqual(r.status, 400);
    });

    await test('分片1上传', async () => {
      const r = await req('POST', `/api/kb/uploads/${uploadId}/chunk`, {
        token, versionId: v1,
        form: { fields: { index: '1' }, file: { name: 'chunk', filename: 'chunk1', buffer: p2 } },
      });
      assert.strictEqual(r.status, 200);
    });

    await test('complete 建 job', async () => {
      const r = await req('POST', `/api/kb/uploads/${uploadId}/complete`, { token, versionId: v1, body: {} });
      assert.strictEqual(r.status, 201);
      documentId = r.body.documentId;
      jobId = r.body.jobId;
      assert.ok(documentId && jobId);
    });

    // 2) 手动跑 worker(不等 setInterval)
    await test('worker 跑通', async () => {
      await ingestWorker.tick();
      const r = await req('GET', `/api/kb/jobs/${jobId}`, { token, versionId: v1 });
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.body.status, 'done', 'job 应为 done，实际 ' + r.body.status + ' error=' + r.body.error);
    });

    // 3) 条目 / 检索 / 图谱
    await test('条目落库', async () => {
      const r = await req('GET', `/api/kb/entries?documentId=${documentId}`, { token, versionId: v1 });
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.body.length, 4);
      assert.ok(r.body[0].content.includes('英雄:'));
    });

    await test('检索返回结果', async () => {
      const r = await req('GET', `/api/kb/search?q=${encodeURIComponent('妲己')}&limit=3`, { token, versionId: v1 });
      assert.strictEqual(r.status, 200);
      assert.ok(r.body.length > 0);
    });

    await test('图谱：4 个实体，含关系', async () => {
      const r = await req('GET', `/api/kb/graph?documentId=${documentId}`, { token, versionId: v1 });
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.body.entities.length, 4);
      assert.ok(r.body.relations.length >= 2, '至少 2 条克制关系');
    });

    // 4) 版本隔离
    await test('v2 看不到 v1 的文档', async () => {
      const r = await req('GET', '/api/kb/documents', { token, versionId: v2 });
      assert.strictEqual(r.status, 200);
      assert.ok(!r.body.some(d => d.id === documentId));
    });

    console.log(`\n${passed} 个测试全部通过`);
  } catch (err) {
    console.error('\n✗ 测试失败：', err.stack || err.message);
    process.exitCode = 1;
  } finally {
    server.close();
  }
}

main();
