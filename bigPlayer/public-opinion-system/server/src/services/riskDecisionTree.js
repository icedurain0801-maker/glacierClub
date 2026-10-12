const { factualClauses } = require('./gameRiskEvidence');
const { productIssueEvidence } = require('./productIssueEvidence');
const { retentionSignals } = require('./playerRetentionRisk');

const POLICY_VERSION = 'verifiable-issue-gates-v9-retention-gradient';
const LEVELS = Object.freeze({ L0: 'normal', L1: 'attention', L2: 'negative', L3: 'urgent' });
const NAMES = Object.freeze({ L0: '噪声过滤', L1: '关注级', L2: '负面待处理', L3: '紧急告警' });
const GATES = Object.freeze({ L0: 'GATE0_noise', L1: 'GATE1_fail_L1', L2: 'GATE3_default_L2', L3: 'GATE2_pass_L3' });
const EVIDENCE = new Set(['screenshot', 'repro_steps', 'data_sample', 'official_quote', 'ticket_proof']);
const CLAIMS = new Set(['fact', 'allegation', 'evidence_backed_allegation']);
const NOISE = new Set(['no_subject', 'not_our_product', 'pure_meme', 'closed_loop', 'repost_dup', 'spam_ad']);
const EXCEPTION = /概率|爆率|公示|后台|造假|暗改|改了爆率|多少抽不出|统计|样本|数据分析|掉落日志|期望值|体感对比/i;
const LUCK = /非酋|欧洲人|保底歪|歪到|吃保底|沉船|出货|单抽歪|双标|玄学|垫刀|祭天|毒奶|血压|破防|心态崩|脸黑|十连全蓝|弃坑|卸载/i;

// This text is the resolved, user-approved policy, shared by both AI profiles.
const RISK_PROMPT = `你是游戏社区舆情风险分级器。判断可查证的产品/运营问题，不衡量骂得多凶。只看本条原文，不能补全图片或猜测后果。帖子/评论独立，不继承父帖等级。社区、游戏字段可用于确认所属产品，但不能当作问题证据。正面攻略、正常讨论、无关回复不进入风险队列，按L0保存normal（noise_reason可用pure_meme表示无风险内容，reason如实解释）。
串行决策树：GATE0噪声→L0；GATE1无明确实际问题→L1；GATE2有经验证的紧急条件→L3；剩余→L2。互斥单选，先命中即结束。
GATE0：no_subject泛吐槽且无法确认具体游戏对象；not_our_product明确讨论非目标服/竞品/私服等；pure_meme纯玩梗或无风险内容；closed_loop明确官方已解决/补偿完的历史复述；repost_dup有重复来源证据；spam_ad广告卖号代充外挂引流。不能因没写游戏名过滤可定位的游戏机制问题。竞品对比若实际指控本产品问题不能过滤。已回复但问题未解决不能closed_loop。没有去重信息不猜重复。
GATE1：必须同时有可核查具体对象+可证实/证伪的说法；claim_type为fact/allegation/evidence_backed_allegation；issue_summary<=20字、issue_object与claim_evidence必须非空且逐字来自本条原文，issue_summary必须能让处理人员明确查什么。不编造负责人或结论期限。无问题停L1，negative_score>0.50仅辅助，不能单独升级。
先检查例外词（概率、爆率、公示、后台、造假、暗改、改了爆率、多少抽不出、统计、样本、数据分析、掉落日志、期望值、体感对比），再执行抽卡个人运气白名单降噪；例外仅免除运气降档，仍要有可核查指控，询问概率公示在哪仍L1。无实证且无例外的非酋、保底歪、吃保底、脸黑、十连全蓝、玄学、破防、口头弃坑等停L1。审美偏好、无数据的强弱口水、肝度、怀旧、纯辱骂、普通规则/活动/补偿/退款流程咨询均L1。个人一次卡顿掉线闪退，无复现路径/版本/其他人反馈为L1。描述什么情况下出现什么异常、指控暗改/错发奖励/口径矛盾、针对具体问题要求修复/补偿/答复为GATE1通过。基准：联盟boss集结每十次一次崩溃，重连耗时并与队友不同步为L2，结尾问手机问题不降档。
GATE2：必须已过GATE1。R1本产品被明确指控赌博/涉赌/和赌场一样（夸张比喻玩梗不算）；R2未成年人充值/诱导消费且原文有监管投诉/凭证；R3概率不按公示/未公示/公示不一致且有实际可读实证；R4已有12315/黑猫/消协/通管局/文旅投诉、律师函/媒体问询或具体legal行动，流程咨询不算；R5可复现错价/兑换错误/奖励超发/无限领取资损BUG；R6账号被盗/数据泄露/隐私外泄/异常扣款；R7持续无法登录游玩/群体中断/回档/维护超时；R8具体组织差评/集体退款/公会联名/举报接龙；R9真实跨平台且互动>=3倍板块基线；R10真实同问题聚集>=50；R11真实文案模板重复且抢楼/水军证据；R12数值/概率/掉落暗改且有可读样本/实证；R13已实际投诉/退款/差评/媒体行动且有可读受理/执行凭证；R14明确报告本游戏玩家严重流失、大量退游或成员过半流失，按紧急业务风险处理，保留待核实属性，不要求先提供统计凭证。假设、否定、已改善及个人口头弃坑不算。匹配机制不公平、双方阵容或战力差距具体投诉为可核查产品问题，至少L2，不能当纯情绪降至L1。R1-R4合规红线可直接触发，其余也必须证据成立；仅提到某词不能触发。每个命中在rule_evidence提供本条原文逐字摘录。不可从“见截图”推断截图内容；只有输入实际提供可读图片内容/凭证字段才算实证。没有真实基线/聚集/跨平台/重复统计时R9/R10/R11不命中。
GATE3：过GATE1但无紧急条件→L2。积分显示增加但实际未增加、具体技能段数与能量异常、活动提前结束且与原定时间矛盾，均为待核查的产品/运营问题，不要求先有截图或投诉凭证才进入L2，也不因这些问题直接升L3。只有奖励少、没抽中、没有出货、什么意思、主观强弱讨论仍L1。计划内维护公告与正常技能攻略为L0。问题概括填不出就回L1。
冲突修正采用最高优先级核心原则：U1/U2不无条件升级，普通退款/涉钱咨询和纯情绪不能升级。U3已客服介入仍未解决的二次公开反馈、U4更新±48h、U5迁移/首页，只对GATE1已通过且有真实上下文证据的内容升一级至L3，未知不得推测。D1已核实谣言/误读降L1并need_clarification=true；D2纯情绪降L1。当前AI已证据验证为L3时不能自动降级，downgrade_suggest交人工；历史旧等级不构成本次紧急证据。confidence<0.6时L2降L1，L1保留L1，L0保留L0；L3保留并标人工复核。低置信追加“（低置信，建议人工抽检）”。不要自行降两次，后端负责最终校验和降级。
每条在risk字段输出对象：level(L0/L1/L2/L3),level_name,gate_result,claim_type(emotion/fact/allegation/evidence_backed_allegation),has_evidence(none/screenshot/repro_steps/data_sample/official_quote/ticket_proof),evidence_types数组,action_intent数组(none/complaint/refund/bad_review/media/organize/legal),hit_rules数组,whitelist_hit布尔,whitelist_override布尔,need_clarification布尔,downgrade_suggest字符串或null,module(抽卡概率/数值平衡/活动运营/付费福利/稳定性/客服售后/内容题材/其他),issue_summary,confidence,reason（引用本条原文词句）,issue_object,claim_evidence,noise_reason,rule_evidence对象(规则编号→原文摘录)。规则编号仅R1-R14/U3-U5/D1/D2/G1/G3/W1；G1=无明确问题，G3=实际问题非紧急，W1=运气白名单。L0 hit_rules可空，其余至少一项。level_name和gate_result必须与level一致。risk之外继续按既有字段输出情感/质量推荐；s和v不是risk的替代，v必须对应risk.level。`;

function sourceOf(input) { return [input.title, input.body].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim(); }
function excerpt(text, value, min = 2) { return typeof value === 'string' && value.trim().length >= min && text.includes(value.trim()); }
function proofTypes(risk, context) {
  // The model cannot turn an uninspected image URL into documentary proof.
  const available = new Set(context.evidenceTypes || []);
  const text = sourceOf(context);
  if (/(?:统计|样本|实测|掉落日志).{0,60}\d|\d.{0,40}(?:抽|次).{0,40}(?:出|获得|掉落)/.test(text)) available.add('data_sample');
  if (/(?:公告|客服|官方).{0,10}(?:说|写|回复|表示|原文)|[“「].{4,80}[”」].{0,15}(?:公告|客服)/.test(text)) available.add('official_quote');
  if (/(?:步骤|点击|进入|打开|发起|start|when|每次).{0,80}(?:崩溃|闪退|异常|领取|兑换|crash)/i.test(text)) available.add('repro_steps');
  return [...new Set((risk.evidence_types || []).filter(type => EVIDENCE.has(type) && available.has(type)))];
}
function verifiedRules(risk, input, text, evidence) {
  const out = [];
  const has = (...types) => types.some(type => evidence.includes(type));
  const patterns = {
    R1: /赌博|涉赌|和赌场一样/,
    R2: /未成年|小孩|儿童/,
    R3: /概率.{0,15}(?:未按|不按|不一致|未公示|没公示)|(?:没|未).{0,5}公示.{0,5}概率|公示.{0,12}(?:不符|不一致)/,
    R4: /12315|黑猫|消协|通管局|文旅|律师函|媒体问询|起诉|诉讼|lawsuit|legal action/i,
    R5: /错价|兑换比例.{0,6}(?:错|异常)|奖励超发|无限领取|重复领取/,
    R6: /被盗|泄露|外泄|异常扣款|重复扣款|未经.{0,8}扣款|(?:account|credentials).{0,30}(?:stolen|hacked|leaked)|unauthorized charge/i,
    R7: /(?:持续|一直|连续|全服|大面积|大范围|大家|所有玩家).{0,30}(?:登录|登入|登陆|进不去|宕机|断连|回档|维护|无法)|(?:登录|登陆|维护).{0,20}(?:持续|超时|小时|全服)|(?:all servers|server-wide).{0,40}(?:down|offline|outage)|(?:cannot|can't|unable to).{0,15}(?:play|log in).{0,30}(?:hours|all day)/i,
    R8: /集体退款|统一.{0,10}差评|公会联名|举报接龙|组织.{0,12}(?:退款|差评|投诉)/,
    R12: /暗改|改了.{0,8}(?:数值|概率|爆率|掉落)|(?:数值|概率|掉落).{0,12}(?:偷改|改动)/,
    R13: /已经|已提交|已投诉|已退款|受理|工单|凭证/,
    R14: /流失|退游|退坑/
  };
  for (const rule of risk.hit_rules || []) {
    const quoted = risk.rule_evidence?.[rule];
    if (!excerpt(text, quoted) || !factualClauses({ body: quoted }).length) continue;
    if (patterns[rule] && !patterns[rule].test(quoted)) continue;
    if (rule === 'R14' && !retentionSignals({ body: quoted }).churn) continue;
    if (rule === 'R2' && !(/充值|消费|刷.{0,12}元/.test(quoted) && /监管|投诉|凭证|12315|黑猫/.test(quoted))) continue;
    if (rule === 'R5' && !has('repro_steps', 'data_sample')) continue;
    if (['R3', 'R12'].includes(rule) && !has('data_sample', 'screenshot', 'official_quote')) continue;
    if (rule === 'R13' && !(has('ticket_proof') && (risk.action_intent || []).some(x => ['complaint', 'refund', 'bad_review', 'media'].includes(x)))) continue;
    if (rule === 'R9' && !(input.riskMetadata?.crossPlatform === true && Number(input.riskMetadata.baseline) > 0 && Number(input.riskMetadata.engagement) >= 3 * input.riskMetadata.baseline)) continue;
    if (rule === 'R10' && !(Number(input.riskMetadata?.clusterCount) >= 50)) continue;
    if (rule === 'R11' && !(input.riskMetadata?.organizedSmearVerified === true)) continue;
    if (['U3', 'U4', 'U5'].includes(rule) && input.riskMetadata?.[rule] !== true) continue;
    if (/^R(?:[1-9]|1[0-4])$|^U[3-5]$/.test(rule)) out.push(rule);
  }
  return [...new Set(out)];
}

function evaluateRiskDecision(input) {
  let risk = input.riskDecision ?? input.rawAnalysis?.riskDecision;
  if (!risk) {
    if (!retentionSignals(input).churn && !retentionSignals(input).matching) return null;
    risk = { level: 'L1', claim_type: 'emotion', confidence: input.confidence, hit_rules: [], rule_evidence: {}, evidence_types: [] };
  }
  const text = sourceOf(input);
  const productIssue = productIssueEvidence(input);
  if (productIssue && (risk.claim_type === 'emotion' || !risk.issue_object || !risk.issue_summary)) {
    risk = { ...risk, claim_type: 'allegation', issue_object: productIssue.issueObject,
      claim_evidence: productIssue.evidence, issue_summary: productIssue.summary, source_fact_repaired: true };
  }
  const signals = retentionSignals(input);
  const signal = signals.churn || signals.matching;
  if (signal) {
    risk = { ...risk, claim_type: 'allegation', issue_object: signals.churn ? (signal.match(/玩家|用户|成员|公会/) || ['玩家'])[0] : '匹配',
      claim_evidence: signal, issue_summary: signals.churn ? '玩家严重流失反馈' : '匹配机制失衡投诉', source_fact_repaired: true };
    if (signals.churn) risk = { ...risk, hit_rules: [...new Set([...(risk.hit_rules || []), 'R14'])], rule_evidence: { ...risk.rule_evidence, R14: signals.churn } };
  }
  const modelLevel = risk.model_level || ((input.rawAnalysis?.severity ?? input.originalSeverity ?? input.severity) === 'normal' && NOISE.has(risk.noise_reason) ? 'L0' : risk.level);
  // The model sometimes mistakes a calm, reproducible fault for emotion. Repair
  // only explicit source facts, never severity scores, abstract topics or reason.
  const fault = factualClauses(input).find(clause =>
    /(?:进入|点击|发起|集结|更新后|每次|反复|频繁).{0,60}(?:闪退|崩溃|卡死)|(?:奖励|充值|道具).{0,16}(?:未到账|不到账|丢失)|(?:出|出现|遇到).{0,8}bug.{0,24}(?:导致|无法|不能|影响)|(?:红点|提示|状态).{0,12}(?:消不掉|无法消除|卡住)|(?:无法|不能|进不去).{0,8}(?:登录|登陆|参加活动|领取奖励)|(?:when.{0,40}(?:start|enter|click)).{0,80}crash/i.test(clause));
  if (fault && (risk.claim_type === 'emotion' || !risk.issue_object || !risk.issue_summary)) {
    const object = fault.match(/闪退|崩溃|卡死|奖励|充值|道具|bug|红点|提示|状态|登录|登陆|活动|crash(?:es)?/i)?.[0];
    risk = { ...risk, claim_type: 'fact', issue_object: object, claim_evidence: fault,
      issue_summary: fault.slice(0, 20), source_fact_repaired: true };
  }
  const evidence = proofTypes(risk, input);
  const whitelistHit = LUCK.test(text) && evidence.length === 0;
  // Run exceptions before applying the personal-luck downgrade.
  const override = whitelistHit && text.split(/[。！？!?\n]/).some(clause => LUCK.test(clause) && EXCEPTION.test(clause));
  let level = 'L1';
  let rules = [];
  const consultation = /(?:在哪|在哪里|什么时候|何时|流程|入口|怎么算|如何申请|怎么申请).{0,8}[？?]?$/.test(text) && !/(?:但是|但|已经|反复|每次|发生|导致|未到账|不一致|暗改|造假)/.test(text);
  const incidental = /(?:一次|刚才|偶尔).{0,12}(?:卡顿|掉线|闪退|崩溃)/.test(text) && !/(?:每次|进入|点击|版本|更新后|也是|反复|频繁|导致)/.test(text);
  const validClaim = !consultation && !incidental && CLAIMS.has(risk.claim_type) && excerpt(text, risk.issue_object)
    && excerpt(text, risk.claim_evidence) && factualClauses({ body: risk.claim_evidence }).length > 0 && typeof risk.issue_summary === 'string' && risk.issue_summary.trim().length > 0;
  // A separate concrete fault is not silenced by an unrelated luck sentence.
  const luckClaim = LUCK.test(risk.claim_evidence || '') && !EXCEPTION.test(risk.claim_evidence || '');
  const hasProblem = validClaim && !(whitelistHit && !override && luckClaim);
  const urgentRules = hasProblem ? verifiedRules(risk, input, text, evidence) : [];
  const noiseVerified = risk.noise_reason !== 'repost_dup' || input.riskMetadata?.duplicateVerified === true;
  if (!hasProblem && (input.sentiment === 'positive' || (modelLevel === 'L0' && noiseVerified && NOISE.has(risk.noise_reason) && text.length > 0))) {
    level = 'L0';
  } else if (hasProblem) {
    level = urgentRules.length ? 'L3' : 'L2';
    rules = urgentRules.length ? urgentRules : ['G3'];
  } else rules = [whitelistHit && !override ? 'W1' : 'G1'];
  const confidence = Number(risk.confidence ?? input.confidence);
  const low = Number.isFinite(confidence) && confidence < 0.6;
  let clarification = risk.need_clarification === true;
  let downgrade = risk.downgrade_suggest || null;
  if (level !== 'L3' && input.riskMetadata?.misreadingVerified === true) { level = 'L1'; rules = ['D1']; clarification = true; }
  if (low && level === 'L2') { level = 'L1'; rules = ['G1']; }
  if (level === 'L3' && low) downgrade = '低置信，建议人工复核紧急证据';
  const quote = (excerpt(text, risk.claim_evidence) ? risk.claim_evidence.trim() : text.slice(0, 40)).slice(0, 60);
  const strength = ['screenshot', 'repro_steps', 'official_quote', 'data_sample', 'ticket_proof'];
  const strongestEvidence = strength.filter(type => evidence.includes(type)).at(-1) || 'none';
  const reason = level === 'L0' ? `“${quote}”未指向待处理产品问题（${risk.noise_reason || '正常内容'}）`
    : level === 'L1' ? `“${quote}”${low && hasProblem ? '具体问题证据置信不足' : '未提供可核查的具体问题'}`
      : level === 'L2' ? `“${quote}”指向${risk.issue_summary.slice(0, 20)}，未验证紧急条件`
        : `“${urgentRules.map(rule => risk.rule_evidence[rule]).join('；')}”命中${urgentRules.join('/')}紧急条件`;
  const suffix = (level === 'L3' && downgrade ? `（待人工复核：${String(downgrade).slice(0, 60)}）` : '')
    + (low ? '（低置信，建议人工抽检）' : '');
  return { ...risk, model_level: modelLevel, level, level_name: NAMES[level], gate_result: GATES[level], hit_rules: rules,
    evidence_types: evidence, has_evidence: strongestEvidence, whitelist_hit: whitelistHit,
    whitelist_override: override, need_clarification: clarification, downgrade_suggest: downgrade,
    issue_summary: hasProblem ? risk.issue_summary.slice(0, 20) : null,
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
    reason: reason.slice(0, 255 - suffix.length) + suffix, verifiedSourceText: text,
    verifiedEvidenceTypes: evidence, verifiedRiskMetadata: input.riskMetadata || {} };
}

module.exports = { POLICY_VERSION, LEVELS, NAMES, GATES, RISK_PROMPT, evaluateRiskDecision, sourceOf };
