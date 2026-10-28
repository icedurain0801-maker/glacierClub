const segmenter = new Intl.Segmenter('zh', { granularity: 'word' });
const stop = new Set('的 了 是 在 有 和 就 都 也 很 不 我 你 他 她 它 我们 你们 这个 那个 一个 什么 怎么 今天 昨天 可以 还是 但是 然后 哈哈 哈哈哈 谢谢 the a an is are was were i you it we they to of and or in on for with this that'.split(' '));
for (const word of 'です ます って でした ました から ので けど そして でも これ それ ここ そこ もの こと する いる ある この その ない だよ だね'.split(' ')) stop.add(word);
// Standalone grammar, intensifiers and greetings do not describe community feedback.
for (const word of '太 真的 真是 所以 做了 好的 嗯 啊 哦 呀 吧 呢 嘛 哈喽 你好 嗨 너무 진짜 정말 이건 이거 뭐야 그냥 아주 매우 좀 더 잘 네 예 아니 안녕 안녕하세요 ㅋㅋ ㅋㅋㅋ ㅎㅎ ㅎㅎㅎ 했다 했어요 した して します だった だから すごく とても 本当に こんにちは はい そう そうです so hi hello hey yes no ok okay my me your our very really just lol lmao wow thanks thank'.split(' ')) stop.add(word);
function isFiller(text) { return stop.has(text.replace(/[\p{P}\p{S}\s]+/gu, '')); }
// Keep concrete game subjects and feedback, not generic praise or disconnected fragments.
const subject = /匹配|排位|副本|关卡|公会|公爵|角色|英雄|皮肤|装备|属性|技能|战力|机制|平衡|服务器|延迟|掉线|闪退|卡顿|登录|登陆|账号|封号|充值|氪金|退款|奖励|礼包|兑换|签到|活动|任务|赛季|竞技|赛事|选手|主播|冠军|联赛|周年|万圣|圣诞|春节|福利|抽奖|抽卡|概率|爆率|掉落|立绘|免费|付费|付费|价格|钻石|金币|体力|公告|更新|版本|BUG|bug|外挂|作弊|攻略|阵容|组队|交易|社交|语音|生日|线下|见面会|职业|礼物|返利|兑换码|糖果|酒馆|立牌|传说|할로윈|이벤트|보상|캐릭터|영웅|스킨|장비|스킬|매칭|서버|업데이트|버그|과금|확률|던전|퀘스트|ハロウィン|イベント|報酬|キャラ|英雄|スキン|装備|ガチャ|マッチ|サーバ|アップデート|バグ|課金|確率|クエスト|halloween|event|reward|character|hero|skin|equipment|matchmaking|server|update|patch|bug|crash|lag|refund|payment|ranked|dungeon|quest|guild|balance|cheat|loot|drop rate|anniversary/i;
const extendedSubject = /伤害|输出|削弱|加强|体力|英雄名|竞技场|战斗|伤害|进度|damage|nerf|buff|pve|pvp|arena|combat|stamina|energy|summon|gacha|relic|artifact|awakening|ascension|faction|formation|skill|ability|dodge|accuracy|ダメージ|弱体|強化|スタミナ|데미지|피해|너프|버프|스태미나/i;
function meaningful(text) { return (subject.test(text) || extendedSubject.test(text)) && !isFiller(text); }
function candidates(text) {
  const result = new Map();
  const clean = String(text || '').normalize('NFKC').replace(/https?:\/\/\S+|<[^>]*>/g, ' ').toLocaleLowerCase();
  for (const part of clean.split(/[\n。！？!?；;，,]+/)) {
    const sentence = part.trim().replace(/\s+/g, ' ');
    if (sentence.length < 2 || isFiller(sentence)) continue;
    const words = [...segmenter.segment(sentence)].filter(s => s.isWordLike).map(s => s.segment);
    for (const word of words) if (word.length >= 2 && !stop.has(word) && !/^\d+$/.test(word) && !/^[a-z]{1,2}$/i.test(word)) result.set(word, 'word');
    for (let size = 2; size <= 5; size++) for (let i = 0; i + size <= words.length; i++) {
      const group = words.slice(i, i + size);
      if (stop.has(group[0]) || stop.has(group.at(-1)) || group.every(w => stop.has(w) || /^\d+$/.test(w))) continue;
      const phrase = group.join(group.every(w => /^[a-z0-9]+$/i.test(w)) ? ' ' : '');
      if (phrase.length >= 4 && phrase.length <= 32) result.set(phrase, 'phrase');
    }
    if (sentence.length >= 6 && sentence.length <= 60 && words.some(w => !stop.has(w))) result.set(sentence, 'sentence');
  }
  return result;
}
function frequentFeedback(rows, limit = 50, { minCount = 2, evidence = false } = {}) {
  const terms = new Map(), seen = new Set();
  for (const row of rows) {
    if (!row.id || seen.has(row.id)) continue;
    seen.add(row.id);
    // search_text contains full source text plus author; use body/title only to avoid counting names.
    const full = typeof row.search_text === 'string' ? row.search_text : '';
    const sourceText = full ? full.slice(0, full.lastIndexOf('\n') < 0 ? full.length : full.lastIndexOf('\n')) : [row.title, row.body].filter(Boolean).join('\n');
    const perContent = candidates(sourceText);
    for (const [text, kind] of perContent) {
      if (!meaningful(text)) continue;
      const term = terms.get(text) || { text, kind, count: 0, feedbackIds: [] };
      term.count++; term.feedbackIds.push(String(row.id)); terms.set(text, term);
    }
  }
  const ranked = [...terms.values()].filter(t => t.count >= minCount).sort((a, b) => b.count - a.count || b.text.length - a.text.length || a.text.localeCompare(b.text));
  // Collapse redundant fragments when the longer expression has the same feedback count.
  const selected = [];
  for (const term of ranked) {
    const compact = term.text.replace(/\s+/g, '');
    if (selected.some(t => t.count === term.count && t.text.replace(/\s+/g, '').includes(compact))) continue;
    selected.push(term); if (selected.length === limit) break;
  }
  return evidence ? selected : selected.map(({ feedbackIds, ...term }) => term);
}
function frequentFeedbackBySentiment(rows, limit = 50, options) {
  return {
    all: frequentFeedback(rows, limit, options),
    positive: frequentFeedback(rows.filter(row => row.sentiment === 'positive'), limit, options),
    negative: frequentFeedback(rows.filter(row => row.sentiment === 'negative'), limit, options)
  };
}
module.exports = { frequentFeedback, frequentFeedbackBySentiment };
