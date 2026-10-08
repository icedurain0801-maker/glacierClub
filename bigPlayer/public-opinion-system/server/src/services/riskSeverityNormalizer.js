const SEVERITY_RANK = Object.freeze({ normal: 0, attention: 1, urgent: 2 });
const NEGATIVE_SCORE_URGENT_THRESHOLD = 0.6;
const NEGATIVE_CONFIDENCE_URGENT_THRESHOLD = 0.6;

// 仅在负面内容上识别游戏问题，避免正面攻略里的“闪退解决方法”等词触发风险升级。
const GAME_ISSUE_PATTERNS = Object.freeze([
  /(?:\b(?:bug|issue|glitch|crash)\b|崩溃|闪退|卡死|卡顿|报错|故障|异常|漏洞)/i,
  /(?:无法|不能|没法|进不去|进不了|无法正常|不能正常).{0,12}(?:启动|登录|登陆|进入|使用|参与|完成|进行|连接|匹配|充值|退款|领取|领取奖励)/i,
  /(?:奖励|道具|货币|数值|规则|活动).{0,16}(?:异常|错误|不对|不符|未到账|不到账|丢失|消失|失败|无法|不能)/i,
  /(?:充值|扣费|退款|付费|支付).{0,16}(?:失败|异常|重复|错误|不到账|未到账|扣错|损失)/i,
  /(?:登录|登陆|账号|帐号|角色|存档).{0,16}(?:异常|失败|丢失|找回|封禁|被盗|安全|无法|不能)/i,
  /(?:服务器|网络|连接|掉线|断线|匹配).{0,16}(?:不可用|异常|失败|不稳定|中断|超时|无法|不能|掉线)/i,
  /(?:外挂|开挂|作弊|恶意利用|安全风险|漏洞).{0,16}(?:举报|影响|破坏|账号|游戏|无法|不能)?/i,
  /(?:影响|导致|造成|无法).{0,16}(?:游戏体验|正常参与|正常进行|使用|游玩|损失)/i,
  /(?:红点|提示|状态).{0,12}(?:消不掉|无法消除|一直存在|卡住)/i
]);

function normalizeEnum(value, fallback) {
  const normalized = String(value || '').toLowerCase();
  return Object.prototype.hasOwnProperty.call(SEVERITY_RANK, normalized) ? normalized : fallback;
}

function bounded(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : 0;
}

function evidenceText({ title, body, topics, reason }) {
  return [title, body, ...(Array.isArray(topics) ? topics : []), reason]
    .filter(value => value != null && String(value).trim())
    .map(value => String(value).trim())
    .join(' ');
}

function hasGameIssueSignal(input = {}) {
  const text = evidenceText(input);
  return Boolean(text) && GAME_ISSUE_PATTERNS.some(pattern => pattern.test(text));
}

function normalizeSeverity(input = {}) {
  const sentiment = String(input.sentiment || '').toLowerCase();
  const rawSeverity = String(input.severity || '').toLowerCase();
  const validOriginalSeverity = Object.prototype.hasOwnProperty.call(SEVERITY_RANK, rawSeverity);
  const originalSeverity = normalizeEnum(rawSeverity, 'normal');
  let severity = originalSeverity;
  const reasons = [];
  const negativeScore = bounded(input.negativeScore ?? input.negative_score);
  const confidence = bounded(input.confidence);
  const gameIssueMatched = sentiment === 'negative' && hasGameIssueSignal(input);

  if (!validOriginalSeverity) reasons.push('invalid_severity_defaulted');

  if (sentiment === 'positive') {
    if (!validOriginalSeverity || severity !== 'normal') reasons.push('positive_forced_normal');
    severity = 'normal';
  } else if (sentiment === 'negative') {
    if (SEVERITY_RANK[severity] < SEVERITY_RANK.attention) {
      severity = 'attention';
      reasons.push('negative_floor_attention');
    }
    if (gameIssueMatched) {
      severity = 'urgent';
      reasons.push('game_issue_upgrade');
    } else if (negativeScore >= NEGATIVE_SCORE_URGENT_THRESHOLD && confidence >= NEGATIVE_CONFIDENCE_URGENT_THRESHOLD && severity !== 'urgent') {
      severity = 'urgent';
      reasons.push('negative_score_upgrade');
    }
  }

  return { severity, originalSeverity, reasons, gameIssueMatched };
}

function buildAnalysisReason(reason, normalized, maxLength = 255) {
  const base = String(reason || '').trim();
  if (!normalized?.reasons?.length) return base ? base.slice(0, maxLength) : null;
  const audit = `severity=${normalized.originalSeverity}->${normalized.severity};reasons=${normalized.reasons.join(',')}`;
  if (audit.length > maxLength) throw new RangeError('severity normalization audit exceeds analysis_reason limit');
  if (base.includes(audit)) return base.slice(0, maxLength);
  const separator = ' | ';
  const baseLimit = maxLength - audit.length - separator.length;
  return baseLimit > 0 && base ? `${base.slice(0, baseLimit)}${separator}${audit}` : audit;
}

module.exports = {
  SEVERITY_RANK,
  NEGATIVE_SCORE_URGENT_THRESHOLD,
  NEGATIVE_CONFIDENCE_URGENT_THRESHOLD,
  GAME_ISSUE_PATTERNS,
  hasGameIssueSignal,
  normalizeSeverity,
  buildAnalysisReason
};
