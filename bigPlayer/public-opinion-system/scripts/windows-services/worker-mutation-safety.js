'use strict';

const path = require('node:path');
const childProcess = require('node:child_process');

const probeScript = path.join(__dirname, 'worker-mutation-safety.ps1');

function realProbeRunner(command, args) {
  return childProcess.execFileSync(command, args, { encoding: 'utf8', windowsHide: true });
}

function mutationProbeArgs({ serviceName, wrapper, xml }) {
  return [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy', 'Bypass',
    '-File', probeScript,
    '-ServiceName', serviceName,
    '-WrapperPath', wrapper,
    '-XmlPath', xml
  ];
}

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function waitForMutationSafety({ wrapper, xml, serviceName, runner = realProbeRunner, timeoutMs = 30000, intervalMs = 250 }) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  do {
    try {
      const output = runner('powershell.exe', mutationProbeArgs({ serviceName, wrapper, xml }));
      if (/SAFE/.test(String(output))) return;
      lastError = new Error('mutation safety probe did not return SAFE');
    } catch (error) {
      lastError = error;
    }
    if (Date.now() >= deadline) break;
    await delay(Math.min(intervalMs, Math.max(0, deadline - Date.now())));
  } while (Date.now() <= deadline);
  const detail = lastError?.message ? `: ${lastError.message}` : '';
  throw Object.assign(new Error(`Worker processes or target files remained busy for ${timeoutMs}ms${detail}`), { code: 'WORKER_MUTATION_GATE_TIMEOUT' });
}

module.exports = { mutationProbeArgs, probeScript, realProbeRunner, waitForMutationSafety };
