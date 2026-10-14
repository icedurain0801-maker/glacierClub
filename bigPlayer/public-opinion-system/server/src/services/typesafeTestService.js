const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const readline = require('node:readline');
const cipher = require('../integrations/credentialCipher');

const COMMUNITY_ID = '00000000-0000-0000-0000-000000000101';
const ENDPOINT = 'https://chat-test.q1.com/v1/systemone';
const MODEL = 'jev-latest';
const AAD = 'public-opinion:typesafe-test:api-key:v1';
const levels = { normal: 'L0', attention: 'L1', negative: 'L2', urgent: 'L3' };
function failure(code, message, status = 409) { return Object.assign(new Error(message), { code, status }); }
function validateResult(result) {
  if (!result || !['L0', 'L1', 'L2', 'L3'].includes(result.final_level) || !['L0', 'L1', 'L2', 'L3'].includes(result.raw_level)
    || !['auto_passed', 'manual_review'].includes(result.status) || !Number.isFinite(result.confidence) || result.confidence < 0 || result.confidence > 1) {
    throw failure('TYPESAFE_INVALID_RESULT', 'TypeSafe 返回格式无效', 502);
  }
  return { final_level: result.final_level, raw_level: result.raw_level, status: result.status, confidence: result.confidence };
}
function plain(value) {
  return String(value || '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<(?:br|\/p|\/div|\/li)\b[^>]*>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"')
    .replace(/https?:\/\/[^\s]+\.(?:png|jpe?g|gif|webp)(?:\?[^\s]*)?(?=\s|$)/gi, '').trim();
}
function runPython(posts, key, onItem = () => {}, env = process.env) {
  return new Promise((resolve, reject) => {
    const python = env.TYPESAFE_PYTHON || (process.platform === 'win32' ? 'C:\\Python310\\python.exe' : 'python3');
    const bridge = path.resolve(__dirname, '../integrations/typesafe_bridge.py');
    const childEnv = { BCGPT_API_KEY: key, PYTHONIOENCODING: 'utf-8', PYTHONDONTWRITEBYTECODE: '1' };
    for (const name of ['PATH', 'Path', 'SystemRoot', 'TEMP', 'TMP']) if (env[name]) childEnv[name] = env[name];
    const child = spawn(python, [bridge], { windowsHide: true, env: childEnv, stdio: ['pipe', 'pipe', 'pipe'] });
    const output = new Map(); let problem; let outputSize = 0;
    const timer = setTimeout(() => { problem = failure('TYPESAFE_TIMEOUT', '测试超时，请稍后重新测试', 504); child.kill(); }, 120000);
    child.stderr.resume(); // stderr不进入应用日志，避免原始第三方错误泄露。
    child.stdout.on('data', chunk => { outputSize += chunk.length; if (outputSize > 65536) { problem = failure('TYPESAFE_INVALID_RESULT', '测试返回异常', 502); child.kill(); } });
    const lines = readline.createInterface({ input: child.stdout });
    lines.on('line', line => {
      try {
        const item = JSON.parse(line);
        if (!Number.isInteger(item.index) || item.index < 0 || item.index >= posts.length || output.has(item.index)) throw Error('index');
        const safe = item.result ? { index: item.index, result: validateResult(item.result) }
          : { index: item.index, error: /^REQUEST_(?:FAILED|REJECTED): HTTP (?:400|401|403|429|5\d\d)/.test(item.error || '') ? String(item.error).split('（')[0].slice(0, 80) : 'TYPESAFE_REQUEST_FAILED' };
        output.set(item.index, safe); onItem(safe);
      } catch { problem = failure('TYPESAFE_INVALID_RESULT', '测试返回异常', 502); child.kill(); }
    });
    child.on('error', () => { problem = failure('TYPESAFE_RUNTIME_UNAVAILABLE', 'Python 测试环境不可用，请联系管理员', 503); });
    child.stdin.on('error', () => {});
    child.on('close', code => {
      clearTimeout(timer); lines.close();
      if (problem) return reject(problem);
      if (code !== 0 || output.size !== posts.length) return reject(failure('TYPESAFE_RUNTIME_UNAVAILABLE', '测试进程未完成，请联系管理员', 503));
      resolve([...output.values()].sort((a, b) => a.index - b.index));
    });
    child.stdin.end(JSON.stringify(posts));
  });
}

class TypeSafeTestService {
  async handleRequest(req, res, { path: parts, id, json, success, errorPayload, readBody }) {
    res.noStore = true;
    if (!req.baasIdentity?.roles?.includes('admin')) return json(res, 403, errorPayload('BAAS_FORBIDDEN', '仅应用管理员可以配置和测试 TypeSafe'));
    if (req.method === 'GET' && id === 'config' && parts.length === 2) return json(res, 200, success(await this.config()));
    if (req.method === 'PUT' && id === 'config' && parts.length === 2) return json(res, 200, success(await this.save(await readBody(req))));
    if (req.method === 'GET' && id === 'runs' && parts[2] === 'latest' && parts.length === 3) return json(res, 200, success(await this.latest()));
    if (req.method === 'POST' && id === 'runs' && parts.length === 2) {
      const body = await readBody(req);
      if (!body || Array.isArray(body) || Object.keys(body).length) return json(res, 400, errorPayload('INVALID_INPUT', '测试范围固定为超能世界国服版50条文字内容'));
      return json(res, 202, success(await this.start()));
    }
    return json(res, 404, errorPayload('NOT_FOUND', 'route not found'));
  }
  constructor({ repo, env = process.env, runner = runPython, storageDir } = {}) {
    this.repo = repo; this.env = env; this.runner = runner;
    this.dir = storageDir || env.PUBLIC_OPINION_TYPESAFE_TEST_DIR || path.join(env.ProgramData || 'C:\\ProgramData', 'PublicOpinion', 'typesafe-tests');
    this.configPath = path.join(this.dir, 'config.json'); this.jobPath = path.join(this.dir, 'latest-run.json');
    this.active = false; this.saving = false; this.initialized = false;
  }
  async read(file) { try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return null; throw failure('TYPESAFE_STORAGE_ERROR', '测试配置读取失败', 503); } }
  async write(file, value) {
    await fs.mkdir(this.dir, { recursive: true });
    const temp = `${file}.${crypto.randomUUID()}.tmp`;
    try {
      await fs.writeFile(temp, JSON.stringify(value), { mode: 0o600 });
      for (let attempt = 0; ; attempt += 1) {
        try { await fs.rename(temp, file); break; }
        catch (error) {
          // Windows may briefly lock the destination during reads or antivirus scans.
          if (process.platform !== 'win32' || !['EPERM', 'EACCES', 'EBUSY'].includes(error.code) || attempt >= 4) throw error;
          await new Promise(resolve => setTimeout(resolve, 25 * (2 ** attempt)));
        }
      }
    }
    finally { await fs.unlink(temp).catch(() => {}); }
  }
  async config() {
    const value = await this.read(this.configPath);
    return { scope: 'global', configured: Boolean(value?.secretCipher), endpoint: ENDPOINT, model: MODEL, checkedAt: value?.checkedAt || null, autoAnalysisEnabled: this.env.PUBLIC_OPINION_ANALYSIS_PROVIDER === 'typesafe' };
  }
  async save(body) {
    if (!body || Object.keys(body).some(key => key !== 'apiKey') || typeof body.apiKey !== 'string' || !/^[\x21-\x7e]{8,4096}$/.test(body.apiKey.trim())) throw failure('INVALID_INPUT', '请输入有效的 API Key', 400);
    if (this.active || this.saving) throw failure('TYPESAFE_BUSY', '正在检测或测试，请稍后再保存');
    this.saving = true;
    try {
      cipher.loadKey(this.env); // 缺加密配置时关闭失败，不降级为明文保存。
      const key = body.apiKey.trim();
      const result = await this.runner(['新人求助，这套阵容第三关怎么过？'], key, () => {}, this.env);
      if (result.length !== 1 || result[0].error || !result[0].result) throw failure('TYPESAFE_AUTH_CHECK_FAILED', `检测失败：${result[0]?.error || '平台返回异常'}，未保存密钥`, 400);
      validateResult(result[0].result);
      await this.write(this.configPath, { secretCipher: cipher.encrypt(key, this.env, { aad: AAD }), checkedAt: new Date().toISOString() });
      return this.config();
    } finally { this.saving = false; }
  }
  async latest() {
    const job = await this.read(this.jobPath);
    if (!this.initialized) {
      this.initialized = true;
      if (job && ['queued', 'running'].includes(job.status) && !this.active) {
        job.status = 'interrupted'; job.error = '服务重启中断测试，请重新运行'; job.finishedAt = new Date().toISOString(); await this.write(this.jobPath, job);
      }
    }
    return job;
  }
  async start() {
    if (this.active || this.saving) throw failure('TYPESAFE_BUSY', '已有测试正在执行，请等待完成');
    this.active = true;
    try {
      const config = await this.read(this.configPath);
      if (!config?.secretCipher) throw failure('TYPESAFE_NOT_CONFIGURED', '请先检测并保存 API Key');
      const key = cipher.decrypt(config.secretCipher, this.env, { aad: AAD });
      const rows = [];
      for (const type of ['post', 'comment']) {
        const candidates = await this.repo.query("SELECT c.id,c.content_type,c.title,c.body,c.published_at,a.severity AS existing_severity FROM po_contents c LEFT JOIN po_analyses a ON a.content_id=c.id WHERE c.community_id=? AND c.is_deleted=0 AND c.content_type=? ORDER BY c.published_at DESC,c.id DESC LIMIT 100", [COMMUNITY_ID, type]);
        rows.push(...candidates.map(row => ({ id: row.id, contentType: row.content_type, text: plain([type === 'post' ? row.title : '', row.body].filter(Boolean).join('\n')), publishedAt: row.published_at, existingLevel: levels[row.existing_severity] || null })).filter(row => row.text).slice(0, 25));
      }
      if (rows.length !== 50) throw failure('TYPESAFE_INSUFFICIENT_SAMPLES', '超能世界国服版的帖子或评论文字样本不足25条');
      const job = { id: crypto.randomUUID(), status: 'running', model: MODEL, communityId: COMMUNITY_ID, total: 50, completed: 0, succeeded: 0, failed: 0, startedAt: new Date().toISOString(), rows };
      await this.write(this.jobPath, job); this.initialized = true;
      this.task = this.execute(job, key); // 后台执行，刷新/关页面不停止；失败在job中安全记录。
      return { id: job.id, status: job.status, total: job.total };
    } catch (error) { this.active = false; throw error; }
  }
  async execute(job, key) {
    let writes = Promise.resolve();
    const receive = item => {
      const row = job.rows[item.index];
      if (!row || row.result || row.error) throw Error('invalid index');
      if (item.result) { row.result = validateResult(item.result); job.succeeded += 1; }
      else { row.error = item.error; job.failed += 1; }
      job.completed += 1;
      const snapshot = JSON.parse(JSON.stringify(job));
      writes = writes.then(() => this.write(this.jobPath, snapshot));
      writes.catch(() => {});
    };
    try {
      await this.runner(job.rows.map(row => `游戏：超能世界；社区：国服版；类型：${row.contentType === 'post' ? '帖子' : '评论'}。以下本条原文独立判断：\n${row.text}`), key, receive, this.env);
      await writes;
      if (job.completed !== job.total) throw Error('incomplete');
      job.status = job.failed ? 'completed_with_errors' : 'completed';
    } catch { job.status = 'failed'; job.error = '测试未完成；已有结果保留，请检查平台连接后重试'; }
    finally {
      await writes.catch(() => {}); job.finishedAt = new Date().toISOString();
      try { await this.write(this.jobPath, job); } catch { /* 不抛出未处理后台拒绝，不打印密钥。 */ }
      this.active = false;
    }
  }
}
module.exports = { TypeSafeTestService, runPython, validateResult, plain };
