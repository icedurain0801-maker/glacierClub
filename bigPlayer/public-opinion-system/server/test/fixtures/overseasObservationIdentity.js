'use strict';
const { createHash } = require('node:crypto');
const { constants, planSha256, fixtureProjection } = require('../../../scripts/overseas-v019-observation-contract');
const sha = x => createHash('sha256').update(x).digest('hex');
module.exports = function fixture(mode = 'sample') {
  const source = { id: constants.SOURCE, gameId: 'fixture-game', communityId: 'fixture-community', boardId: '100017', region: 'overseas', platform: 'bigplayer_h5' };
  const account = { id: 'fixture-account', sourceId: source.id, gameId: source.gameId, communityId: source.communityId, enabled: true };
  const data = { source, account, credentials: [{ id: 'fixture-credential', sourceId: source.id, accountId: account.id, gameId: source.gameId, communityId: source.communityId,
    type: 'api_token', status: 'active', expiresAt: new Date(Date.now() + 60000).toISOString(), version: 1 }],
    sites: [2, 9, 16].map(language => { const url = `https://club-en.q1.com/?env=web&gameId=2177&gameVersion=2177-US-ZS&lang=en-US&languageId=${language}`;
      return { id: 'fixture-site-' + language, url, urlSha256: sha(url), registryUrl: url, registryUrlSha256: sha(url), enabled: true, authStatus: 'authorized', registryVersion: 1 }; }),
    versions: { source: 1, config: 1, schedule: 1, credential: 1, registry: 1 }, manifestSha256: sha('fixture-manifest'), planSha256: planSha256(mode), mode, allowUnknownAuthProbe: false };
  return { ...data, ...fixtureProjection(data) };
};
