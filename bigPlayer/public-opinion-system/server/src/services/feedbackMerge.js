const aliases = new Map([
  ['halloween', '万圣节'], ['ハロウィン', '万圣节'], ['할로윈', '万圣节'],
  ['event', '活动'], ['イベント', '活动'], ['이벤트', '活动'],
  ['reward', '奖励'], ['報酬', '奖励'], ['보상', '奖励']
]);
function mergeFeedback(items, limit = 80) {
  const groups = new Map();
  for (const item of items || []) {
    const raw = String(item.translatedText || item.text || '').normalize('NFKC').trim().replace(/\s+/g, ' ');
    const display = aliases.get(raw.toLocaleLowerCase()) || raw;
    if (!display) continue;
    const key = display.toLocaleLowerCase();
    const group = groups.get(key) || { text: display, kind: item.kind, originals: new Set(), ids: new Set(), fallback: 0 };
    for (const original of item.originalTexts || [item.text]) group.originals.add(original);
    if (Array.isArray(item.feedbackIds)) for (const id of item.feedbackIds) group.ids.add(String(id));
    else group.fallback = Math.max(group.fallback, Number(item.count) || 0);
    if (item.translatedText || display !== raw) { group.translatedText = display; group.translationStatus = 'completed'; }
    else if (item.translationStatus === 'failed' && group.translationStatus !== 'completed') group.translationStatus = 'failed';
    groups.set(key, group);
  }
  return [...groups.values()].map(group => ({ text: group.text, kind: group.kind, count: group.ids.size + group.fallback, originalTexts: [...group.originals], translatedText: group.translatedText, translationStatus: group.translationStatus })).filter(item => item.count >= 1).sort((a, b) => b.count - a.count || a.text.localeCompare(b.text)).slice(0, limit);
}
module.exports = { mergeFeedback };
