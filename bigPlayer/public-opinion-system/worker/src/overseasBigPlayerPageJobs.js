'use strict';
const fail = code => { throw Object.assign(new Error(code), { code }); };
const atomicCallbacks = new WeakSet();
// Same transaction as PageStore. Policy is supplied by the existing main chain;
// this helper only protects content versions and preserves queue idempotence.
function createOverseasPageJobs({ analysisOptionsFor, translationOptions, repairMissingJobs = false } = {}) {
  const completePolicy = typeof analysisOptionsFor === 'function'
    && translationOptions?.targetLanguage === 'zh-CN' && typeof translationOptions.version === 'string' && Boolean(translationOptions.version.trim());
  translationOptions = translationOptions ? Object.freeze({ ...translationOptions }) : null;
  const callback = async ({ facade, contents, items }) => {
    for (let index = 0; index < contents.length; index++) {
      const entry = contents[index], raw = items[index], row = entry?.content;
      if (!row || raw?.recoveryContextAncestor || row.is_deleted || (entry.change === 'unchanged' && !repairMissingJobs)) continue;
      if (!row.fingerprint || row.fingerprint !== raw.fingerprint) fail('OVERSEAS_QUEUE_CONTENT_VERSION_CONFLICT');
      const analysis = typeof analysisOptionsFor === 'function' ? await analysisOptionsFor({ content: row, raw, change: entry.change }) : null;
      if (completePolicy && (!analysis || analysis.profile !== 'light' || typeof analysis.version !== 'string'
        || !analysis.version.trim() || !['keyword_match', 'all_content'].includes(analysis.triggerReason))) fail('OVERSEAS_QUEUE_POLICY_REQUIRED');
      if (analysis) {
        if (!analysis.profile || !analysis.version || !analysis.triggerReason) fail('OVERSEAS_QUEUE_POLICY_REQUIRED');
        const jobs = await facade.query('SELECT * FROM po_analysis_jobs WHERE content_id=? AND analysis_profile=? AND analysis_version=? FOR UPDATE', [row.id, analysis.profile, analysis.version]);
        if (jobs.length > 1) fail('OVERSEAS_QUEUE_IDENTITY_CONFLICT');
        const existing = jobs[0];
        if (existing?.content_fingerprint === row.fingerprint && (repairMissingJobs || ['completed', 'running'].includes(existing.status))) {
          // Do not reset a completed version or touch a running lease.
        } else {
          if (existing && (existing.status === 'running' || existing.lease_owner != null || existing.lease_until != null)) fail('OVERSEAS_QUEUE_ACTIVE_VERSION_CONFLICT');
          await facade.enqueueAnalysisJob(row.id, { ...analysis, contentFingerprint: row.fingerprint,
            force: Boolean(existing && existing.content_fingerprint !== row.fingerprint) });
        }
      }
      if (translationOptions && (String(row.title || '').trim() || String(row.body || '').trim())) {
        const { targetLanguage, version } = translationOptions;
        if (targetLanguage !== 'zh-CN' || !version) fail('OVERSEAS_QUEUE_POLICY_REQUIRED');
        const jobs = await facade.query('SELECT * FROM po_translation_jobs WHERE content_id=? AND target_language=? AND translation_version=? FOR UPDATE', [row.id, targetLanguage, version]);
        if (jobs.length > 1) fail('OVERSEAS_QUEUE_IDENTITY_CONFLICT');
        const existing = jobs[0];
        if (existing?.content_fingerprint === row.fingerprint && (repairMissingJobs || ['completed', 'running'].includes(existing.status))) continue;
        if (existing && (existing.status === 'running' || existing.lease_owner != null || existing.lease_until != null)) fail('OVERSEAS_QUEUE_ACTIVE_VERSION_CONFLICT');
        await facade.enqueueTranslationJob(row.id, { targetLanguage, version, contentFingerprint: row.fingerprint,
          force: Boolean(existing && existing.content_fingerprint !== row.fingerprint) });
      }
    }
  };
  if (completePolicy) atomicCallbacks.add(callback);
  return callback;
}
module.exports = { createOverseasPageJobs, isAtomicPageJobsCallback: callback => atomicCallbacks.has(callback) };
