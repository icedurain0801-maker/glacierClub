const RULES = [
  ['稳定性', /登录|登陆|闪退|崩溃|卡死|卡顿|掉线|进不去|连不上|报错|服务器|炸服|维护|黑屏/i],
  ['充值付费', /充值|扣款|支付|氪金|648|礼包|价格|付费|退款/i],
  ['抽卡概率', /抽卡|抽奖|概率|爆率|保底|十连|出货|卡池|掉落/i],
  ['活动运营', /活动|任务|签到|限时|赛季|通行证|兑换|更新|公告/i],
  ['奖励福利', /奖励|福利|宝箱|礼包码|兑换码|补偿|免费|领取/i],
  ['玩法机制', /玩法|副本|关卡|匹配|竞技场|公会|联盟|阵容|技能|战斗/i],
  ['数值平衡', /英雄|角色|强度|数值|属性|战力|伤害|平衡|削弱|加强/i],
  ['客服售后', /客服|申诉|投诉|人工|回复|处理/i],
  ['内容题材', /剧情|故事|立绘|皮肤|建模|配音|音乐|画风/i]
];
function inferTopics(value) {
  const text = String(value || '').trim();
  if (!text) return [];
  const topics = RULES.filter(([, pattern]) => pattern.test(text)).map(([topic]) => topic).slice(0, 3);
  return topics.length ? topics : ['其他'];
}
function topicsForRow(row) {
  let values = row?.topics;
  if (typeof values === 'string') { try { values = JSON.parse(values); } catch { values = []; } }
  const existing = Array.isArray(values) ? [...new Set(values.filter(value => typeof value === 'string' && value.trim()).map(value => value.trim()))].slice(0, 5) : [];
  if (existing.length) return existing;
  return inferTopics([row?.translated_title || row?.title, row?.translated_body || row?.body].filter(Boolean).join(' '));
}
module.exports = { inferTopics, topicsForRow };
