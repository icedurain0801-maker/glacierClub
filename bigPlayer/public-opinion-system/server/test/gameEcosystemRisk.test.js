'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { ecosystemEvidence } = require('../src/services/gameEcosystemRisk');
const { seriousEvidence, assertUrgentValidated } = require('../src/services/urgentValidation');
const { fixtureAI, reviewValue } = require('./fixtures/contextualReview');
const { mediaHash } = require('../../shared/facebookMedia');
const { normalizeAnalysisResult } = require('../src/services/riskSeverityNormalizer');

test('OCR换行引用只还原实际源片段，西语三方升级广告也识别', () => {
  const { sourceQuote } = require('../src/services/gameEcosystemRisk');
  assert.equal(sourceQuote('BUY & SELL\\nACCOUNTS', 'BUY & SELL\nACCOUNTS'), 'BUY & SELL\\nACCOUNTS');
  assert.equal(sourceQuote('BUY & SELL\n\nACCOUNTS', 'BUY & SELL ACCOUNTS'), 'BUY & SELL\n\nACCOUNTS');
  assert.equal(sourceQuote('BUY & SELL', 'BUY COINS'), null);
  const text = 'PAQUETE COMPLETO DE MEJORA DE JUEGOS';
  assert.equal(ecosystemEvidence(text, text), true);
});

test('代充及三方交易招揽需有本条明确服务依据', () => {
  for (const text of ['专业代充优惠接单，联系我', '出售游戏账号和金币，私聊交易', 'BUY & SELL\nOUR SERVICES\nACCOUNTS\nCASH\nSKINS', 'FULL GAME UPGRADE PACKAGE', 'CASHOUT - VENTA DE COINS - SERVICIO DE MEJORA']) {
    assert.equal(ecosystemEvidence(text, text), true, text);
    assert.equal(seriousEvidence(text, text, 'ecosystem_abuse'), true);
  }
  for (const text of ['官方商城充值优惠', '代充是什么意思？', '不要参与账号交易', '禁止代充服务', 'Avoid buying accounts', '游戏升级攻略', 'skins']) assert.equal(ecosystemEvidence(text, text), false, text);
  assert.equal(ecosystemEvidence('正常攻略', '出售账号'), false);
});

test('纯图片广告从初判到独立复核、落库均为L3，图片原因可追溯', async () => {
  const quote = 'FULL GAME UPGRADE PACKAGE';
  const media = ['https://scontent.fbcdn.net/ad.jpg'];
  const { ai, requests } = fixtureAI({ level: 'L0', review: input => reviewValue(input, {
    level: 'L3', hasIssue: true, emergency: 'ecosystem_abuse', quote,
    reason: '本条附图宣传第三方游戏账号和道具交易服务，严重破坏游戏生态，需紧急处理。',
    sentiment: 'neutral', sentimentReason: '附图是交易广告，没有表达对游戏的情绪，但具有严重生态风险。'
  }) });
  ai.imageAnalyzer = { analyze: async () => ({ version: 'facebook-image-v1', status: 'complete', mediaHash: mediaHash(media), images: [{ url: media[0], text: quote, description: '第三方账号、现金和道具交易服务广告' }], inputTokens: 0, outputTokens: 0, totalTokens: 0 }) };
  const item = { platform: 'facebook', contentType: 'comment', body: '', media };
  const result = await ai.analyze(item);
  assert.equal(result.severity, 'urgent');
  assert.equal(result.typeSafeDecision.final_level, 'L3');
  assert.equal(normalizeAnalysisResult(result, item).severity, 'urgent');
  assert.match(result.analysisReason, /附图/);
  assert.match(requests[0].payload.messages[0].content, /游戏生态风险优先规则/);
  const changed = structuredClone(item); changed.media = ['https://scontent.fbcdn.net/other.jpg'];
  assert.throws(() => assertUrgentValidated(result, changed), { code: 'FACEBOOK_IMAGE_EVIDENCE_MISMATCH' });
});

test('复核不能凭无依据咨询或反交易提醒生成L3', async () => {
  for (const quote of ['代充是什么意思？', '不要参与账号交易']) {
    const { ai } = fixtureAI({ level: 'L3', review: input => reviewValue(input, { level: 'L3', hasIssue: true, emergency: 'ecosystem_abuse', quote, reason: '本条涉及交易，需紧急处理。' }) });
    await assert.rejects(ai.analyze({ contentType: 'comment', body: quote }), { code: 'URGENT_REVIEW_EVIDENCE_INSUFFICIENT' });
  }
});
