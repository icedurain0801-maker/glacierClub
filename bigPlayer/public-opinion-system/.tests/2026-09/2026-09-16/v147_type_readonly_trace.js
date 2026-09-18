const { loadRuntimeEnv } = require('../../../server/src/runtimeEnv');
loadRuntimeEnv();
const { Repository } = require('../../../server/src/db/repository');
const { CredentialContext } = require('../../../server/src/services/credentialContext');
const { BigPlayerH5Connector } = require('../../../server/src/connectors/bigPlayerH5Connector');
const { normalizePlatformItem } = require('../../../worker/src/worker');

(async () => {
  const repo = new Repository();
  try {
    const sources = await repo.listSources(null, { platform: 'bigplayer_h5' });
    const source = sources.find(source => source.community_id === '00000000-0000-0000-0000-000000000101' && source.enabled);
    if (!source) throw new Error('SOURCE_UNAVAILABLE');
    const account = await repo.getDefaultAccount({ sourceId: source.id, enabled: true });
    const credentialContext = new CredentialContext({ repo });
    const fetchImpl = async (...args) => {
      const response = await fetch(...args);
      const body = await response.clone().json();
      const samples = [];
      const visit = value => {
        if (!value || typeof value !== 'object') return;
        if (value.id != null && ('content' in value || 'title' in value) && 'createTime' in value) samples.push({ id: value.id, type: value.type ?? null, typeJs: typeof value.type, titleLength: String(value.title || '').trim().length });
        for (const child of Object.values(value)) if (child && typeof child === 'object') visit(child);
      };
      visit(body);
      console.log(JSON.stringify({ stage: 'real_source_response', path: new URL(String(args[0])).pathname, status: response.status, samples: samples.slice(0, 20) }));
      return response;
    };
    const connector = new BigPlayerH5Connector(process.env, { credentialContext, fetchImpl });
    const page = await connector.listPosts({ source, account, credentialContext, limit: 2 });
    for (const item of page.items.slice(0, 20)) {
      const normalized = normalizePlatformItem(item, { scope: 'posts', platform: source.platform });
      console.log(JSON.stringify({ stage: 'connector_to_worker', sourceId: source.id, id: item.externalId, connectorType: item.type, safeRawType: item.rawPayload?.type ?? null, normalizedRawType: normalized.rawPayload?.type ?? null, normalizedRawNull: normalized.rawPayload === null }));
    }
  } finally { await repo.pool.end(); }
})().catch(error => { console.error(JSON.stringify({ errorCode: error.code || 'READ_ONLY_TRACE_FAILED' })); process.exitCode = 1; });
