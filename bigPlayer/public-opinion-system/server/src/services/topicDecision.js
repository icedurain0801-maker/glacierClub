// Topic classification is independent of sentiment, severity and notification routing.
const TOPIC_VERSION = 'typesafe-topics-v1';
const TOPICS = Object.freeze({
  stages: '关卡副本', formation: '阵容搭配', growth: '角色养成', equipment: '装备属性',
  tavern: '酒馆收益', pulls: '抽取晒卡', probability: '概率争议', rewards: '奖励领取',
  events: '活动任务', guild: '公会社交', payment: '充值消费', bugs: '功能异常',
  performance: '登录性能', support: '客服投诉', daily: '签到分享', guide: '攻略咨询',
  combat: '战斗竞技', balance: '数值平衡', resources: '资源道具', art: '美术剧情',
  operations: '版本运营', churn: '退游流失', trading: '交易广告', interaction: '简短互动',
  text_insufficient: '文字不足', off_topic: '社区闲聊'
});
function topicQuestion(instructions = '') {
  return { type: 'choice', instructions: `${instructions}只按本条原文语义选最具体的主要议题，支持各语言；不得继承父帖或猜图片。具体主题优先于攻略咨询、签到分享和简短互动。游戏专有名词即使只有几个字也可识别主题：魔塔/熔火试炼/试炼之地是关卡副本；黑石头/星之币/蜗牛石/红卷/红轴是资源道具；觉醒/升星/专属培养是角色养成，洗双爆伤是装备属性。酒馆刷新红轴归酒馆收益，抽卡结果归抽取晒卡，质疑概率归概率争议；崩溃卡顿登录故障归登录性能，其他明确Bug归功能异常；仅恭喜/赞/同意归简短互动；无文字或只有指代、数字且无法辨别主题归文字不足。不要因正负面情绪改变议题。`, criteria: TOPICS };
}
function parseTopicAnswer(answer) {
  const key = answer?.choice;
  if (!Object.hasOwn(TOPICS, key) || typeof answer.confidence !== 'number' || !Number.isFinite(answer.confidence) || answer.confidence < 0 || answer.confidence > 1) {
    return { version: TOPIC_VERSION, status: 'pending', topics: ['议题待补判'] };
  }
  return { version: TOPIC_VERSION, status: 'classified', key, confidence: answer.confidence, topics: [TOPICS[key]] };
}
function emptyTopic(content = {}) {
  let media = content.media;
  if (typeof media === 'string') { try { media = JSON.parse(media); } catch { media = null; } }
  const hasImage = Array.isArray(media) && media.length || /https?:\/\/[^\s]+\.(?:png|jpe?g|gif|webp)(?:\?[^\s]*)?(?=\s|$)/i.test([content.title, content.body].filter(Boolean).join('\n'));
  return { version: TOPIC_VERSION, status: 'classified', topics: [hasImage ? '图片分享·文字不足' : '文字不足'], confidence: 1 };
}
function refineTopicDecision(decision, content) {
  return decision.key === 'text_insufficient' ? { ...decision, topics: emptyTopic(content).topics } : decision;
}
module.exports = { TOPIC_VERSION, TOPICS, topicQuestion, parseTopicAnswer, emptyTopic, refineTopicDecision };
