const { factualClauses } = require('./gameRiskEvidence');
function retentionSignals(input = {}) {
  const clauses = factualClauses(input).filter(text => !/(?:没有|并未|不存在|并不|未见).{0,12}(?:流失|退游|退坑)|(?:流失|退游|退坑).{0,8}(?:不严重|已解决|已改善|已缓解)/.test(text));
  const churn = clauses.find(text => /(?:玩家|用户|成员|公会).{0,12}(?:流失|退游|退坑).{0,8}(?:严重|大量|大批|过半)|(?:严重|大量|大批).{0,10}(?:玩家|用户|成员).{0,8}(?:流失|退游|退坑)|(?:玩家|用户|成员|公会).{0,8}(?:过半|大批|大量).{0,8}(?:流失|退游|退坑)/.test(text));
  const matching = clauses.find(text => /匹配|matchmaking/i.test(text) && (
    /匹配.{0,12}(?:不公|不公平|失衡|机制成谜|不合理|差距过大)/.test(text)
    || /(?:我们|我方).{0,50}(?:只有|没有|全员无|战力|等级).{0,100}(?:对方|敌方).{0,40}(?:人均|全是|战力|等级)/.test(text)
  ));
  return { churn, matching };
}
module.exports = { retentionSignals };
