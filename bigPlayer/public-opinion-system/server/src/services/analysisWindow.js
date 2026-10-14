const DAY_MS = 86400000;
function analysisPublishedFrom(requested, env = process.env, now = Date.now()) {
  const days = Number(env.PUBLIC_OPINION_ANALYSIS_LOOKBACK_DAYS);
  if (!Number.isFinite(days) || days <= 0) return requested;
  const cutoff = now - days * DAY_MS;
  const from = requested == null ? NaN : new Date(requested).getTime();
  return new Date(Number.isFinite(from) ? Math.max(from, cutoff) : cutoff);
}
module.exports = { analysisPublishedFrom };
