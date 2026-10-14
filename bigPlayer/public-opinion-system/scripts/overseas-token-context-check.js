'use strict';
delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
const crypto = require('node:crypto');
const { loadRuntimeEnv } = require('../server/src/runtimeEnv'); loadRuntimeEnv();
delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '1';
if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') throw new Error('TLS_VERIFICATION_DISABLED');
const { Repository } = require('../server/src/db/repository');
const { CredentialContext } = require('../server/src/services/credentialContext');
const SOURCE_ID = '081a16d2-5545-4afd-9c65-e04777e4540b';
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
(async () => {
  const repo = new Repository(process.env);
  try {
    const source = (await repo.listSources()).find(item => item.id === SOURCE_ID); const account = await repo.getAccount(source.default_account_id);
    const token = (await new CredentialContext({ repo }).loadApiToken(account, 'api_token'));
    const site = JSON.parse(source.config).siteUrls[0]; const url = new URL('/api/club/v1/auth/user/context', site.url);
    const response = await fetch(url, { headers: { accept: 'application/json', authorization: /^Bearer\s+/i.test(token) ? token : `Bearer ${token}`, 'user-agent': 'PublicOpinionSystem/1.0' }, signal: AbortSignal.timeout(10000) });
    const body = Buffer.from(await response.arrayBuffer()); let parsed = null; try { parsed = JSON.parse(body.toString('utf8')); } catch {}
    const boards = Array.isArray(parsed?.data?.boards) ? parsed.data.boards : Array.isArray(parsed?.data) ? parsed.data : [];
    const boardAuthorized = boards.some(board => String(board?.id || board?.boardId || '') === '100017');
    console.log(JSON.stringify({ status: response.ok && parsed?.code === 0 && boardAuthorized ? 'TOKEN_CONTEXT_AUTHORIZED' : 'TOKEN_CONTEXT_REJECTED', httpStatus: response.status, providerCode: parsed?.code ?? null, bodyBytes: body.length, bodySha256: sha(body), boardAuthorized, boardCount: boards.length, topLevelKeys: parsed && typeof parsed === 'object' ? Object.keys(parsed) : [], dataKeys: parsed?.data && typeof parsed.data === 'object' ? Object.keys(parsed.data) : [] }, null, 2));
  } finally { await repo.pool.end(); }
})().catch(error => { console.error(JSON.stringify({ status: 'NO_GO', errorCode: error.code || 'TOKEN_CONTEXT_CHECK_FAILED' })); process.exitCode = 1; });
