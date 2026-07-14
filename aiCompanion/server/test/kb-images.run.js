// 知识库图片提取端到端测试:上传含内嵌图 xlsx -> ingest -> 验证落库+磁盘文件+级联删除。
require('dotenv').config();
const assert = require('assert');
const http = require('http');
const fs = require('fs');
const path = require('path');
const app = require('../src/app');
const db = require('../src/config/db');
const cfg = require('../src/config/kb');
const embedding = require('../src/services/embedding');
const vectorStore = require('../src/services/vectorStore');
const ingestWorker = require('../src/services/ingestWorker');

const PORT = process.env.KB_IMG_TEST_PORT || 3195;

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
      const boundary = '----kbimgtest' + Date.now();
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
    const adminUser = process.env.SUPER_ADMIN_USERNAME || 'admin';
    const adminPass = process.env.SUPER_ADMIN_PASSWORD || 'Admin123!';
    const login = await req('POST', '/api/auth/login', { body: { username: adminUser, password: adminPass } });
    assert.strictEqual(login.status, 200);
    const token = login.body.token;
    const me = await req('GET', '/api/auth/me', { token });
    const v1 = me.body.versions[0].id;

    await require('./fixtures/generateWithImages');
    const samplePath = path.join(__dirname, 'fixtures', 'sample_with_images.xlsx');
    const fileBuf = fs.readFileSync(samplePath);

    let documentId, jobId;
    await test('上传含内嵌图 xlsx', async () => {
      const init = await req('POST', '/api/kb/uploads/init', {
        token, versionId: v1, body: { name: 'sample_with_images.xlsx', size: fileBuf.length, totalChunks: 1 },
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
      jobId = done.body.jobId;
    });

    await test('worker 处理完成', async () => {
      await ingestWorker.tick();
      const r = await req('GET', `/api/kb/jobs/${jobId}`, { token, versionId: v1 });
      assert.strictEqual(r.body.status, 'done', 'job 应为 done, 实际 ' + r.body.status + ' error=' + r.body.error);
    });

    let entries;
    await test('条目落库(4行)', async () => {
      const r = await req('GET', `/api/kb/entries?documentId=${documentId}`, { token, versionId: v1 });
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.body.length, 4);
      entries = r.body;
    });

    await test('图片按行精确关联落库', async () => {
      const [rows] = await db.query(
        `SELECT ee.entry_id, ee.url, e.row_index FROM kb_entry_images ee
           JOIN knowledge_entries e ON e.id = ee.entry_id WHERE e.version_id=? AND e.document_id=?`,
        [v1, documentId]
      );
      const byRow = new Map();
      for (const r of rows) {
        if (!byRow.has(r.row_index)) byRow.set(r.row_index, []);
        byRow.get(r.row_index).push(r.url);
      }
      assert.strictEqual(byRow.has(1), false, '亚瑟行(row_index=1)不应有图');
      assert.strictEqual(byRow.get(2).length, 1, '妲己行应有1张图');
      assert.strictEqual(byRow.get(3).length, 2, '后羿行应有2张图');
      assert.strictEqual(byRow.has(4), false, '庄周行不应有图');
    });

    await test('图片文件确实写入磁盘', async () => {
      const [rows] = await db.query('SELECT url FROM kb_entry_images WHERE version_id=?', [v1]);
      assert.ok(rows.length >= 3);
      for (const r of rows) {
        const diskPath = path.join(cfg.kbImagesDir, r.url.replace(/^\/kb-images\//, ''));
        assert.ok(fs.existsSync(diskPath), '文件应存在: ' + diskPath);
      }
    });

    await test('静态路由可访问图片', async () => {
      const [rows] = await db.query('SELECT url FROM kb_entry_images WHERE version_id=? LIMIT 1', [v1]);
      const r = await req('GET', rows[0].url, {});
      assert.strictEqual(r.status, 200);
    });

    await test('B端条目预览接口返回 images 字段', async () => {
      const r = await req('GET', `/api/kb/entries?documentId=${documentId}`, { token, versionId: v1 });
      const withImg = r.body.find(e => e.row_index === 2);
      assert.ok(Array.isArray(withImg.images), 'entries 应带 images 字段');
      assert.strictEqual(withImg.images.length, 1);
      const noImg = r.body.find(e => e.row_index === 1);
      assert.deepStrictEqual(noImg.images, [], '无图行 images 应为空数组');
    });

    await test('删除文档级联清理数据库与磁盘', async () => {
      const docDir = path.join(cfg.kbImagesDir, String(v1), String(documentId));
      assert.ok(fs.existsSync(docDir), '删除前目录应存在');
      const r = await req('DELETE', `/api/kb/documents/${documentId}`, { token, versionId: v1 });
      assert.strictEqual(r.status, 200);
      const [rows] = await db.query('SELECT id FROM kb_entry_images WHERE version_id=? AND entry_id IN (SELECT id FROM knowledge_entries WHERE document_id=?)', [v1, documentId]);
      assert.strictEqual(rows.length, 0, 'kb_entry_images 应级联删除');
      assert.strictEqual(fs.existsSync(docDir), false, '磁盘目录应被清理');
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
