const assert = require('assert');
const qualityScoring = require('../src/services/qualityScoring');

function main() {
  const llmResult = qualityScoring.normalizeLlmResult(JSON.stringify({
    accuracy: 5,
    relevance: 4,
    completeness: 4,
    safety: 5,
    tone: 4,
    riskLevel: 'medium',
    riskTags: ['relevance', 'unknown', 'relevance'],
    summary: '回答基本准确，但还可以更聚焦。',
    strengths: ['理解了问题', '语气自然'],
    issues: ['建议补充细节'],
  }));

  assert.strictEqual(llmResult.total_score, 88);
  assert.strictEqual(llmResult.grade, 'B');
  assert.strictEqual(llmResult.risk_level, 'medium');
  assert.deepStrictEqual(JSON.parse(llmResult.risk_tags_json), ['relevance']);

  const heuristic = qualityScoring.buildHeuristicScore({
    userContent: '今天上海会下雨吗',
    assistantContent: '上海今天降雨概率较高，建议你带伞出门。',
    refs: [],
  });

  assert.ok(heuristic.total_score >= 60);
  assert.ok(['low', 'medium', 'high'].includes(heuristic.risk_level));
  assert.ok(['A', 'B', 'C', 'D', 'E'].includes(heuristic.grade));
  assert.strictEqual(qualityScoring.computeTotalScore({
    accuracy_score: 5,
    relevance_score: 4,
    completeness_score: 3,
    safety_score: 5,
    tone_score: 4,
  }), 84);
  assert.strictEqual(qualityScoring.gradeFromTotal(95), 'A');
  assert.strictEqual(qualityScoring.gradeFromTotal(62), 'D');
  console.log('quality scoring tests passed');
}

main();
