const string = { type: 'string' };
const number = { type: 'number' };
const boolean = { type: 'boolean' };
const nullableString = { type: ['string', 'null'] };
const list = items => ({ type: 'array', items });
const enumeration = values => ({ type: 'string', enum: values });
const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const rules = [...Array.from({ length: 15 }, (_, i) => `R${i + 1}`), 'U3', 'U4', 'U5'];
const risk = object({
  level: enumeration(['L0', 'L1', 'L2', 'L3']),
  level_name: enumeration(['噪声过滤', '关注级', '紧急告警']),
  gate_result: enumeration(['GATE0_noise', 'GATE1_fail_L1', 'GATE2_pass_L3', 'GATE3_default_L2']),
  claim_type: enumeration(['emotion', 'fact', 'allegation', 'evidence_backed_allegation']),
  has_evidence: enumeration(['none', 'screenshot', 'repro_steps', 'data_sample', 'official_quote', 'ticket_proof']),
  evidence_types: list(enumeration(['screenshot', 'repro_steps', 'data_sample', 'official_quote', 'ticket_proof'])),
  action_intent: list(enumeration(['none', 'complaint', 'refund', 'bad_review', 'media', 'organize', 'legal'])),
  hit_rules: list(enumeration([...rules, 'D1', 'D2', 'G1', 'G3', 'W1'])),
  whitelist_hit: boolean, whitelist_override: boolean, need_clarification: boolean,
  downgrade_suggest: nullableString,
  module: enumeration(['抽卡概率', '数值平衡', '活动运营', '付费福利', '稳定性', '客服售后', '内容题材', '其他']),
  issue_summary: nullableString, confidence: number, reason: string,
  issue_object: string, claim_evidence: string,
  noise_reason: { type: ['string', 'null'], enum: [null, 'no_subject', 'not_our_product', 'pure_meme', 'closed_loop', 'repost_dup', 'spam_ad'] },
  rule_evidence: object(Object.fromEntries(rules.map(rule => [rule, nullableString])))
});
const row = object({ i: { type: 'integer' }, s: enumeration(['positive', 'neutral', 'negative']),
  v: enumeration(['normal', 'attention', 'negative', 'urgent']), n: number, c: number, d: boolean,
  r: string, t: list(string), m: string, q: number, h: boolean, p: boolean, f: boolean, qr: string, risk });
const RISK_RESPONSE_FORMAT = { type: 'json_schema', json_schema: {
  name: 'public_opinion_risk_v9', strict: true, schema: object({ results: list(row) })
} };
module.exports = { RISK_RESPONSE_FORMAT };
