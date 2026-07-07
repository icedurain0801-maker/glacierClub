require('dotenv').config();
const assert = require('assert');
const http = require('http');
const app = require('../src/app');

const PORT = process.env.TEST_PORT || 3199;

function req(method, path, { token, versionId, body } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (versionId) headers['X-Version-Id'] = String(versionId);
    const r = http.request({ host: '127.0.0.1', port: PORT, method, path, headers }, res => {
      let buf = '';
      res.on('data', c => (buf += c));
      res.on('end', () => resolve({ status: res.statusCode, body: buf ? JSON.parse(buf) : null }));
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

async function main() {
  const server = app.listen(PORT);
  let passed = 0;
  const test = async (name, fn) => { await fn(); console.log(`  ✓ ${name}`); passed++; };

  try {
    // 1) 超管登录成功
    const adminUser = process.env.SUPER_ADMIN_USERNAME || 'admin';
    const adminPass = process.env.SUPER_ADMIN_PASSWORD || 'Admin123!';
    let adminToken;
    await test('超管登录成功', async () => {
      const r = await req('POST', '/api/auth/login', { body: { username: adminUser, password: adminPass } });
      assert.strictEqual(r.status, 200);
      assert.ok(r.body.token);
      assert.strictEqual(r.body.user.isSuperAdmin, true);
      adminToken = r.body.token;
    });

    // 2) 登录失败
    await test('错误密码登录失败 401', async () => {
      const r = await req('POST', '/api/auth/login', { body: { username: adminUser, password: 'wrong' } });
      assert.strictEqual(r.status, 401);
    });

    // 3) 超管 me 拿到全部版本
    await test('超管 me 返回全部版本', async () => {
      const r = await req('GET', '/api/auth/me', { token: adminToken });
      assert.strictEqual(r.status, 200);
      assert.ok(r.body.versions.length >= 2);
    });

    // 4) 超管建普通用户
    const uname = 'op_' + Date.now();
    let newUserId;
    await test('超管新建用户', async () => {
      const r = await req('POST', '/api/users', { token: adminToken, body: { username: uname, password: 'secret6' } });
      assert.strictEqual(r.status, 201);
      newUserId = r.body.id;
    });

    // 取两个版本 id
    const meAdmin = await req('GET', '/api/auth/me', { token: adminToken });
    const v1 = meAdmin.body.versions[0].id;

    // 5) 授权用户到 v1
    await test('授权用户到版本1', async () => {
      const r = await req('POST', `/api/users/${newUserId}/grant`, { token: adminToken, body: { versionId: v1, role: 'operator' } });
      assert.strictEqual(r.status, 201);
    });

    // 6) 重复授权 409
    await test('重复授权返回 409', async () => {
      const r = await req('POST', `/api/users/${newUserId}/grant`, { token: adminToken, body: { versionId: v1 } });
      assert.strictEqual(r.status, 409);
    });

    // 7) 普通用户登录，me 只含 v1
    let opToken;
    await test('普通用户 me 只含被授权版本', async () => {
      const login = await req('POST', '/api/auth/login', { body: { username: uname, password: 'secret6' } });
      assert.strictEqual(login.status, 200);
      assert.strictEqual(login.body.user.isSuperAdmin, false);
      opToken = login.body.token;
      const me = await req('GET', '/api/auth/me', { token: opToken });
      assert.strictEqual(me.body.versions.length, 1);
      assert.strictEqual(me.body.versions[0].id, v1);
    });

    // 8) 普通用户访问超管接口 403
    await test('普通用户访问用户管理 403', async () => {
      const r = await req('GET', '/api/users', { token: opToken });
      assert.strictEqual(r.status, 403);
    });

    // 9) 普通用户建版本 403
    await test('普通用户建版本 403', async () => {
      const r = await req('POST', '/api/versions', { token: opToken, body: { code: 'x', gameName: 'x', region: 'x' } });
      assert.strictEqual(r.status, 403);
    });

    console.log(`\n${passed} 个测试全部通过`);
  } catch (err) {
    console.error('\n✗ 测试失败：', err.message);
    process.exitCode = 1;
  } finally {
    server.close();
  }
}

main();
