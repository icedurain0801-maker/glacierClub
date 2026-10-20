(function attachRiskModes(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PublicOpinionRiskModes = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createRiskModes() {
  // negative is a legacy link alias for the combined risk work queue.
  const MODE_TO_SEVERITY = Object.freeze({ negative: 'urgent', attention: 'attention', urgent: 'urgent' });
  const MODE_SEVERITIES = Object.freeze({ attention: Object.freeze(['attention']), negative: Object.freeze(['negative', 'urgent']), urgent: Object.freeze(['negative', 'urgent']) });
  const severitiesForRiskMode = value => MODE_SEVERITIES[normalizeRiskMode(value)] || [];
  const normalizeRiskMode = value => {
    const mode = String(value || '').trim();
    return Object.prototype.hasOwnProperty.call(MODE_TO_SEVERITY, mode) ? mode : null;
  };
  const severityForRiskMode = value => {
    const mode = normalizeRiskMode(value);
    return mode ? MODE_TO_SEVERITY[mode] : null;
  };
  const normalizeRiskFilters = (filters = {}) => {
    const mappedSeverity = severityForRiskMode(filters.riskMode);
    if (filters.riskMode && !mappedSeverity) { const error = new Error('riskMode is not supported'); error.code = 'INVALID_INPUT'; throw error; }
    if (mappedSeverity && filters.severity && !severitiesForRiskMode(filters.riskMode).includes(filters.severity)) { const error = new Error('riskMode and severity conflict'); error.code = 'INVALID_INPUT'; throw error; }
    if (!mappedSeverity) return filters;
    const normalized = { ...filters, severity: mappedSeverity };
    delete normalized.sentiment;
    return normalized;
  };
  return Object.freeze({ MODE_TO_SEVERITY, normalizeRiskMode, severityForRiskMode, severitiesForRiskMode, normalizeRiskFilters });
}));
