const VALID_SCHEDULER_MODES = new Set(['off', 'shadow', 'enabled']);

function schedulerMode(env = process.env) {
  const mode = String(env.UNIFIED_SOURCE_SCHEDULER_MODE || 'off').trim().toLowerCase();
  return VALID_SCHEDULER_MODES.has(mode) ? mode : 'off';
}

function requireExplicitSchedulerMode(env = process.env) {
  const configured = String(env.UNIFIED_SOURCE_SCHEDULER_MODE || '').trim().toLowerCase();
  if (!configured) {
    const error = new Error('UNIFIED_SOURCE_SCHEDULER_MODE must be explicitly configured');
    error.code = 'UNIFIED_SCHEDULER_MODE_UNSET';
    throw error;
  }
  if (!VALID_SCHEDULER_MODES.has(configured)) {
    const error = new Error('UNIFIED_SOURCE_SCHEDULER_MODE must be off, shadow or enabled');
    error.code = 'UNIFIED_SCHEDULER_MODE_INVALID';
    throw error;
  }
  return configured;
}

module.exports = { schedulerMode, requireExplicitSchedulerMode };
