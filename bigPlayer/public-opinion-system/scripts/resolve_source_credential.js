#!/usr/bin/env node
'use strict';

// 采集源凭据解析器：给定 --source-id 或 --account-id，复用生产 Repository + CredentialContext，
// 从 po_sources.config 读取 baseUrl，从 po_credentials.secret_cipher 用 AES-256-GCM 解出授权 token，
// 只把 { baseUrl, token } 以单行 JSON 打到 stdout，供 q1_crawler.py 消费。
//
// 安全口径（与后台凭据接口一致）：
//   - 明文 token 只在本进程内存出现，只写 stdout（供父进程 pipe），绝不落库/落日志/落文件。
//   - CREDENTIAL_ENC_KEY 缺失或非法时 fail-closed（沿用 credentialCipher.loadKey）。
//   - 所有错误走 stderr + 非零退出码，绝不用空 baseUrl/token 伪装成功。
//
// 用法：
//   node resolve_source_credential.js --source-id <uuid> [--credential-type api_token]
//   node resolve_source_credential.js --account-id <uuid> [--credential-type api_token]

const { loadRuntimeEnv } = require('../server/src/runtimeEnv');
const { Repository } = require('../server/src/db/repository');
const { CredentialContext } = require('../server/src/services/credentialContext');
const { parseSourceConfig } = require('../server/src/connectors/bigPlayerH5Connector');

// 与生产一致地加载 public-opinion-system/.env（DB 连接串 + CREDENTIAL_ENC_KEY）。
if (loadRuntimeEnv()) process.stderr.write(`${JSON.stringify({ env: 'loaded' })}\n`);
else process.stderr.write(`${JSON.stringify({ env: 'missing .env' })}\n`);

function parseArgs(argv) {
  const out = { credentialType: 'api_token' };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--source-id') out.sourceId = argv[++i];
    else if (a === '--account-id') out.accountId = argv[++i];
    else if (a === '--credential-type') out.credentialType = argv[++i];
  }
  return out;
}

function fail(code, message) {
  process.stderr.write(`${JSON.stringify({ error: code, message })}\n`);
  process.exitCode = 1;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.sourceId && !args.accountId) {
    fail('ARGS_REQUIRED', 'either --source-id or --account-id is required');
    return;
  }

  const repo = new Repository();
  try {
    let source = null;
    let accountId = args.accountId || null;

    if (args.sourceId) {
      source = (await repo.query('SELECT * FROM po_sources WHERE id=?', [args.sourceId]))[0] || null;
      if (!source) { fail('SOURCE_NOT_FOUND', 'source not found'); return; }
      if (!accountId) {
        const account = await repo.getDefaultAccount({ sourceId: args.sourceId });
        if (!account) { fail('ACCOUNT_NOT_FOUND', 'no enabled account bound to source'); return; }
        accountId = account.id;
      }
    } else {
      const account = await repo.getAccount(accountId);
      if (!account) { fail('ACCOUNT_NOT_FOUND', 'account not found'); return; }
      if (account.source_id) source = (await repo.query('SELECT * FROM po_sources WHERE id=?', [account.source_id]))[0] || null;
    }

    const baseUrl = source ? (parseSourceConfig(source).baseUrl || '') : '';
    if (!baseUrl) { fail('BASE_URL_MISSING', 'source config has no baseUrl'); return; }

    const credentials = new CredentialContext({ repo });
    const loaded = await credentials.load(accountId, args.credentialType);
    const token = loaded.apiToken || loaded.accessToken || '';
    if (!token) { fail('TOKEN_EMPTY', 'decrypted credential has no api token'); return; }

    // 单行 JSON，仅供父进程 pipe 读取，不换行打印额外内容。
    process.stdout.write(`${JSON.stringify({ baseUrl, token, accountId, sourceId: source ? source.id : null })}\n`);
  } catch (err) {
    // ConnectorError/CredentialContextError 带 code；其余归一到通用错误码。绝不回显 token。
    fail(err && err.code ? err.code : 'RESOLVE_FAILED', err && err.message ? String(err.message) : 'credential resolve failed');
  } finally {
    if (repo.pool && typeof repo.pool.end === 'function') { try { await repo.pool.end(); } catch { /* ignore */ } }
  }
}

main();
