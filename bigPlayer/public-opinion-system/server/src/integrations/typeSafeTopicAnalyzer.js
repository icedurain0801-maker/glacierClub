const { TypeSafeAnalyzer } = require('./typeSafeAnalyzer');
const { analysisText } = require('../services/urgentValidation');
const { topicQuestion, parseTopicAnswer, emptyTopic, refineTopicDecision } = require('../services/topicDecision');

class TypeSafeTopicAnalyzer {
  constructor(env = process.env, { client } = {}) { this.client = client || new TypeSafeAnalyzer(env); }
  async classify(items) {
    if (!Array.isArray(items) || items.length > 10) throw new Error('Topic batch must contain at most 10 items');
    const output = items.map(item => analysisText(item) ? null : emptyTopic(item));
    const pending = items.flatMap((item, index) => output[index] ? [] : [{ index, text: analysisText(item), game: item.game_name || '', community: item.community_name || '' }]);
    if (!pending.length) return output;
    const questions = Object.fromEntries(pending.map(item => [`topic_${item.index}`, topicQuestion(`仅判断state.items中index=${item.index}的这一条，不引用其他条目。`)]));
    await this.client.acquire();
    try {
      const response = await this.client.request({ model: this.client.model, state: { items: pending }, questions }, this.client.key());
      for (const item of pending) {
        const decision = parseTopicAnswer(response.answers?.[`topic_${item.index}`]);
        if (decision.status !== 'classified') throw Object.assign(new Error('Invalid topic response'), { code: 'TYPESAFE_TOPIC_INVALID_RESPONSE' });
        output[item.index] = { ...refineTopicDecision(decision, items[item.index]), model: this.client.model };
      }
      return output;
    } finally { this.client.release(); }
  }
}
module.exports = { TypeSafeTopicAnalyzer };
