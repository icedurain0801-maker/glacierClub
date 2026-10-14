'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  mutationProbeArgs,
  waitForMutationSafety
} = require('../../../scripts/windows-services/worker-mutation-safety');

const onWindows = process.platform === 'win32';

function powershell(command) {
  return childProcess.execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
    encoding: 'utf8',
    windowsHide: true
  }).trim();
}

function stoppedService() {
  return powershell("Get-Service | Where-Object Status -eq 'Stopped' | Select-Object -First 1 -ExpandProperty Name");
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'po mutation probe '));
  const wrapper = path.join(root, 'worker wrapper.exe');
  const xml = path.join(root, 'worker config.xml');
  fs.writeFileSync(wrapper, 'original-wrapper-bytes');
  fs.writeFileSync(xml, '<service><arguments>"C:\\isolated path\\worker\\src\\worker.js"</arguments></service>');
  return { root, wrapper, xml };
}

function runProbe(input) {
  return childProcess.spawnSync('powershell.exe', mutationProbeArgs(input), {
    encoding: 'utf8',
    windowsHide: true
  });
}

function startExclusiveLock(target, root) {
  const script = path.join(root, 'hold-exclusive-lock.ps1');
  fs.writeFileSync(script, [
    'param([Parameter(Mandatory=$true)][string]$TargetPath)',
    "$handle=[IO.File]::Open($TargetPath,'Open','ReadWrite','None')",
    "Write-Output 'READY'",
    '[Console]::ReadLine() | Out-Null',
    '$handle.Dispose()'
  ].join('\r\n'));
  const child = childProcess.spawn('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', script, '-TargetPath', target
  ], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => {
      stdout += chunk;
      if (stdout.includes('READY')) resolve(child);
    });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.once('error', reject);
    child.once('exit', code => {
      if (!stdout.includes('READY')) reject(new Error(`lock helper exited ${code}: ${stderr}`));
    });
  });
}

test('real PowerShell probe safely binds named parameters including paths with spaces', { skip: !onWindows }, () => {
  const f = fixture();
  try {
    const result = runProbe({ serviceName: stoppedService(), wrapper: f.wrapper, xml: f.xml });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /SAFE/);
  } finally {
    fs.rmSync(f.root, { recursive: true, force: true });
  }
});

test('real PowerShell probe fails closed while the wrapper process is alive', { skip: !onWindows }, () => {
  const f = fixture();
  try {
    const livePowerShell = powershell('(Get-Process -Id $PID).Path');
    const result = runProbe({ serviceName: stoppedService(), wrapper: livePowerShell, xml: f.xml });
    assert.equal(result.status, 21, result.stderr);
    assert.doesNotMatch(result.stdout, /SAFE/);
  } finally {
    fs.rmSync(f.root, { recursive: true, force: true });
  }
});

test('real PowerShell probe fails closed while a target has an exclusive lock', { skip: !onWindows }, async () => {
  const f = fixture();
  let locker;
  try {
    locker = await startExclusiveLock(f.wrapper, f.root);
    const result = runProbe({ serviceName: stoppedService(), wrapper: f.wrapper, xml: f.xml });
    assert.equal(result.status, 22, result.stderr);
    assert.doesNotMatch(result.stdout, /SAFE/);
  } finally {
    if (locker) {
      locker.stdin.end('\n');
      await new Promise(resolve => locker.once('exit', resolve));
    }
    fs.rmSync(f.root, { recursive: true, force: true });
  }
});

test('real probe timeout against a running service leaves target bytes unchanged', { skip: !onWindows }, async () => {
  const f = fixture();
  const before = {
    wrapper: fs.readFileSync(f.wrapper),
    xml: fs.readFileSync(f.xml)
  };
  try {
    assert.equal(powershell("(Get-Service -Name 'PublicOpinionWorker').Status"), 'Running');
    await assert.rejects(
      waitForMutationSafety({
        serviceName: 'PublicOpinionWorker',
        wrapper: f.wrapper,
        xml: f.xml,
        timeoutMs: 500,
        intervalMs: 25
      }),
      error => error.code === 'WORKER_MUTATION_GATE_TIMEOUT'
    );
    assert.deepEqual(fs.readFileSync(f.wrapper), before.wrapper);
    assert.deepEqual(fs.readFileSync(f.xml), before.xml);
  } finally {
    fs.rmSync(f.root, { recursive: true, force: true });
  }
});
