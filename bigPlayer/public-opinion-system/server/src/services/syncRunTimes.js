'use strict';

function timestamp(value) {
  if (value == null || value === '') return NaN;
  if (value instanceof Date) return value.getTime();
  const text = String(value).trim();
  return Date.parse(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(text) ? text : `${text.replace(' ', 'T')}Z`);
}

// Older writers used the database's local CURRENT_TIMESTAMP for submission,
// but UTC for execution. A row has no provenance identifying its old timezone:
// preserve the raw values instead of guessing an eight-hour conversion.
function normalizeSyncRunTimes(run) {
  if (!run) return run;
  const execution = [run.started_at, run.display_started_at, run.finished_at].map(timestamp).filter(Number.isFinite);
  if (!execution.length) return run;
  const earliest = Math.min(...execution);
  const invalid = ['created_at', 'requested_at'].filter(key => timestamp(run[key]) > earliest);
  if (!invalid.length) return run;
  const result = { ...run, raw_time_fields: { ...(run.raw_time_fields || {}) }, timestamp_warning: '历史提交时间与执行时间的时区不一致，暂不显示异常提交时间；原始值已保留。' };
  for (const key of invalid) { result.raw_time_fields[key] = run[key]; result[key] = null; }
  return result;
}

module.exports = { normalizeSyncRunTimes };
