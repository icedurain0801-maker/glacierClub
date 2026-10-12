'use strict';
const { factualClauses } = require('./gameRiskEvidence');

// A complaint must name an observable discrepancy. Scarcity, preference and
// personal lottery results are not faults, even when their sentiment is strong.
function isPlannedMaintenance(input = {}) {
  const text = [input.title, input.body].filter(Boolean).join(' ');
  return /(?:维护|更新)公告/.test(text) && /(?:预计|将于|计划|维护期间)/.test(text)
    && !/(?:超过|超时|仍然|迟迟|未按|未能).{0,20}(?:维护|恢复|登录|结束)/.test(text);
}
function productIssueEvidence(input = {}) {
  if (isPlannedMaintenance(input)) return null;
  for (const clause of factualClauses(input)) {
    const patterns = [
      { object: '积分', match: /(?:显示|提示).{0,25}(?:加|增加|获得).{0,20}(?:积分|点数).{0,35}(?:积分|点数).{0,10}(?:没变|没有变|未增加|没增加|未到账)/ },
      { object: '活动', match: /活动.{0,15}(?:提前结束|提前关闭)|活动.{0,12}结束.{0,30}(?:不应该|不是说|公告|原定|说好).{0,20}(?:结束|关闭)/ },
      { object: '技能', match: /(?:技能|大招).{0,30}(?:\d+段|\d+次|\d+能量).{0,120}(?:bug|异常|不符合|不一致)|(?:bug|异常).{0,100}(?:技能|大招).{0,30}(?:\d+段|\d+次|\d+能量)/i }
    ];
    for (const { object, match } of patterns) {
      if (match.test(clause)) {
        // Use an actual source substring rather than an inferred module name.
        const issueObject = object === '技能' ? clause.match(/技能|大招/)[0] : object;
        return { issueObject, evidence: clause, summary: `${object}表现与预期不符` };
      }
    }
  }
  // A quantified mechanics report can span several sentences; require an
  // explicit live-bug complaint so normal skill guides do not become negative.
  const live = factualClauses(input).join(' ');
  if (/(?:小?bug|异常).{0,20}(?:没人反馈|未修复|没修复|一直存在)/i.test(live)
    && /(?:技能|大招).{0,30}\d+段/.test(live) && /\d+(?:次|能量|回合)/.test(live)) {
    return { issueObject: live.match(/技能|大招/)[0], evidence: factualClauses(input).find(clause => /(?:技能|大招).{0,30}\d+段/.test(clause)), summary: '技能能量机制异常反馈' };
  }
  return null;
}

module.exports = { productIssueEvidence, isPlannedMaintenance };
