const test = require('node:test');
const assert = require('node:assert/strict');
const { DiscordConnector, parseConfig, normalizeMessage } = require('../src/connectors/discordConnector');
const { buildExternalConnectors } = require('../src/connectors/externalConnectors');

const GUILD_ID = '123456789012345678';
const CHANNEL_A = '223456789012345678';
const CHANNEL_B = '323456789012345678';
const ENV = { DISCORD_ENABLED: 'true' };
const account = { id: 'account-1' };
const credentialContext = { loadApiToken: async () => 'test-token' };
const response = (payload, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => payload });
const message = (id, overrides = {}) => ({ id, content: '正文', timestamp: '2026-09-03T01:02:03.000Z', author: { id: '423456789012345678', username: 'tester', global_name: '测试用户' }, attachments: [], reactions: [], ...overrides });
const source = (config = {}) => ({ config: { guildId: GUILD_ID, channelIds: [CHANNEL_A, CHANNEL_B], ...config } });

test('Discord uses official API by default and fails closed when disabled or untrusted', async () => {
  const missing = await new DiscordConnector({}, { credentialContext }).installationHealth();
  assert.equal(missing.installed, false);
  assert.equal(missing.reason, 'disabled by configuration');
  assert.equal((await new DiscordConnector(ENV, { credentialContext }).installationHealth()).installed, true);
  assert.equal((await new DiscordConnector({ ...ENV, DISCORD_API_BASE_URL: 'https://evil.example/api' }, { credentialContext }).installationHealth()).installed, false);
  assert.ok(buildExternalConnectors(ENV, { credentialContext }).discord instanceof DiscordConnector);
});

test('source and message normalization preserve Discord reply linkage', () => {
  const config = parseConfig({ config: { guildId: GUILD_ID, channelIds: [CHANNEL_A, CHANNEL_A, 'bad'], anonymizeAuthors: true } });
  assert.deepEqual(config.channelIds, [CHANNEL_A]);
  const item = normalizeMessage(message('523456789012345678', { message_reference: { message_id: '423456789012345678' } }), { guildId: GUILD_ID, channelId: CHANNEL_A, config });
  assert.equal(item.contentType, 'comment');
  assert.equal(item.platformParentId, '423456789012345678');
  assert.equal(item.authorName, 'discord-user-12345678');
});

test('listOwnedContents reads encrypted credential context and paginates channels', async () => {
  const requests = [];
  const connector = new DiscordConnector(ENV, { credentialContext, fetchImpl: async (url, options) => { requests.push({ url: new URL(String(url)), authorization: options.headers.authorization }); const channel = new URL(String(url)).pathname.split('/')[4]; return response(channel === CHANNEL_A ? [message('623456789012345678'), message('523456789012345678')] : [message('723456789012345678')]); } });
  const page = await connector.listOwnedContents({ source: source({ channelIds: [CHANNEL_A] }), account, limit: 2 });
  assert.equal(page.items.length, 2);
  assert.equal(requests[0].authorization, 'Bot test-token');
  assert.equal(JSON.parse(page.nextCursor).before, '523456789012345678');
});

test('listComments provides a real reply page and excludes unrelated messages', async () => {
  const postId = '423456789012345678';
  const connector = new DiscordConnector(ENV, { credentialContext, fetchImpl: async () => response([
    message('523456789012345678', { message_reference: { message_id: postId } }),
    message('623456789012345678'),
    message('723456789012345678', { message_reference: { message_id: '999999999999999999' } })
  ]) });
  const page = await connector.listComments({ source: source({ channelIds: [CHANNEL_A] }), account, postId, limit: 3 });
  assert.equal(page.items.length, 1);
  assert.equal(page.items[0].contentType, 'comment');
  assert.equal(page.items[0].platformParentId, postId);
});

test('health check maps invalid token without exposing credential values', async () => {
  const connector = new DiscordConnector(ENV, { credentialContext, fetchImpl: async () => response({}, 401) });
  const health = await connector.accountHealth({ source: source({ channelIds: [CHANNEL_A] }), account });
  assert.equal(health.reason, 'DISCORD_TOKEN_INVALID');
});

test('missing credential fails closed before any Discord request', async () => {
  let calls = 0;
  const connector = new DiscordConnector(ENV, { credentialContext: { loadApiToken: async () => { throw Object.assign(new Error('missing'), { code: 'CREDENTIAL_NOT_FOUND' }); } }, fetchImpl: async () => { calls += 1; return response([]); } });
  await assert.rejects(() => connector.listOwnedContents({ source: source({ channelIds: [CHANNEL_A] }), account }), error => error.code === 'CREDENTIAL_NOT_FOUND');
  assert.equal(calls, 0);
});
