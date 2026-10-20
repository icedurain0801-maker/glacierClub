// Validate the explanation, independently of the verbatim evidence quote.
function isChineseExplanation(value) {
  if (typeof value !== 'string' || !/\p{Script=Han}/u.test(value)) return false;
  // Product names and technical terms may contain Latin letters. Other scripts
  // belong in the separate quote field, not in the operational explanation.
  const letters = [...value].filter(char => /\p{Letter}/u.test(char));
  const chinese = letters.filter(char => /\p{Script=Han}/u.test(char)).length;
  return chinese / letters.length >= 0.6
    && letters.every(char => /[\p{Script=Han}\p{Script=Latin}]/u.test(char));
}
function formatExplanation(reason, quote, manualReview = false) {
  return `${reason.trim()}（原文依据：“${quote}”）${manualReview ? '（需人工复核）' : ''}`;
}
module.exports = { isChineseExplanation, formatExplanation };
