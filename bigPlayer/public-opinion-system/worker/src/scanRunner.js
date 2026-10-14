function createScanRunner(run) {
  let inflight = null;
  return () => {
    if (inflight) return inflight;
    inflight = Promise.resolve().then(run).finally(() => { inflight = null; });
    return inflight;
  };
}

module.exports = { createScanRunner };
