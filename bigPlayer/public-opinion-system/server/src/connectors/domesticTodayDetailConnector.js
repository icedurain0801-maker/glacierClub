'use strict';
const crypto = require('node:crypto');
const { completeDetailBlocks } = require('./lastNightDetailBlockContract');
const fail = code => { throw Object.assign(new Error(code), { code }); };
function stripSecrets(value) {
  if (Array.isArray(value)) return value.map(stripSecrets);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !/(token|password|authorization|cookie|secret|credential|sessionid|apikey|privatekey)/i.test(key))
    .map(([key, child]) => [key, stripSecrets(child)]));
}
// Inject the frozen CURRENT release connector, not a stopped overseas runtime.
function domesticDetailConnector(BaseConnector) {
  return class DomesticTodayDetailConnector extends BaseConnector {
    async enrichQ1FeedItems(input) {
      const details = new Map(), request = this.requestQ1;
      this.requestQ1 = async (...args) => {
        const payload = await request.apply(this, args);
        if (args[0] === '/api/club/v1/auth/post/') details.set(String(args[3].postId), payload?.data);
        return payload;
      };
      let result;
      try { result = await super.enrichQ1FeedItems(input); }
      finally { this.requestQ1 = request; }
      this.domesticDetails = new Map();
      result.items = result.items.map(item => {
        const detail = details.get(String(item.id));
        if (!detail || Array.isArray(detail) || String(detail.id ?? detail.postId) !== String(item.id)) fail('DOMESTIC_DETAIL_ID_MISMATCH');
        const nontext = Array.isArray(detail.content) && detail.content.length > 0
          && detail.content.every(block => [1, 5].includes(block?.type));
        if (nontext) {
          const complete = completeDetailBlocks(detail, item.id);
          this.domesticDetails.set(String(item.id), { detail: stripSecrets(complete.providerDetail), nontext: true });
          return { ...item, ...detail, id: item.id, createTime: item.createTime, title: String(detail.title || ''),
            content: detail.content, _contentMedia: complete.media,
            _contentIntegrity: { status: 'detail_enriched', hasText: false, aiInputScope: 'title-only', opaqueSemantics: 'uninterpreted' } };
        }
        if (item._contentIntegrity?.status !== 'detail_enriched') fail('DOMESTIC_DETAIL_REQUIRED');
        this.domesticDetails.set(String(item.id), { detail: stripSecrets(detail), nontext: false });
        return item;
      });
      return result;
    }
    async listFeedContents(input) {
      if (input.source?.id !== '5c21f78d-5f67-4467-963d-dcdeb5e26cab') fail('DOMESTIC_SCOPE_MISMATCH');
      const page = await super.listFeedContents(input);
      for (const item of page.items) {
        const saved = this.domesticDetails?.get(String(item.externalId));
        if (!saved) fail('DOMESTIC_FULL_DETAIL_MISSING');
        item.rawPayload.providerDetail = saved.detail;
        item.rawPayload.providerDetailSha256 = crypto.createHash('sha256').update(JSON.stringify(saved.detail)).digest('hex');
        if (saved.nontext) item.body = '';
        item.rawPayload.analysisBasis = { bodyTextAvailable: Boolean(item.body?.trim()), explicitTitleAvailable: Boolean(item.title?.trim()),
          scope: saved.nontext ? 'title-only' : 'title-and-provider-text', mediaAnalyzed: false, opaqueAnalyzed: false };
        item.isDeleted = saved.detail.isDeleted === true || saved.detail.moderatorIsDelete === true
          || (saved.detail.status != null && Number(saved.detail.status) < 0);
      }
      return page;
    }
  };
}
module.exports = { domesticDetailConnector };
