'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const ROOT = 'C:/ProgramData/PublicOpinion/collection-check';
const OVERSEAS = '081a16d2-5545-4afd-9c65-e04777e4540b';
const powershell = args => execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', ...args], { windowsHide: true, encoding: 'utf8', timeout: 120000 });
function workerRoot() {
  const xml = fs.readFileSync('C:/ProgramData/PublicOpinion/services/PublicOpinionWorker.xml', 'utf8');
  const directory = xml.match(/<workingdirectory>([^<]+)<\/workingdirectory>/)?.[1];
  if (!directory || !path.resolve(directory).toLowerCase().startsWith(path.resolve('C:/ProgramData/PublicOpinion/releases/').toLowerCase() + path.sep)) throw new Error('WORKER_PATH_INVALID');
  return path.dirname(directory);
}
async function main(argv) {
  if (!(argv.length === 1 && argv[0] === '--sync') && !(argv.length === 2 && argv[0] === '--check' && /^[a-f0-9-]{36}$/.test(argv[1]))) throw new Error('CHECK_ARGUMENTS_INVALID');
  const runtime = workerRoot();
  require(path.join(runtime, 'server/src/runtimeEnv')).loadRuntimeEnv();
  const { Repository } = require(path.join(runtime, 'server/src/db/repository'));
  const { configuration, dueCheck, recoveryDecision } = require('./sourceCollectionCheck');
  const repo = new Repository({ ...process.env, DB_POOL_SIZE: '2' });
  const connection = await repo.pool.getConnection();
  const lockName = 'po-source-check:' + (argv[1] || 'task-sync');
  let locked = false;
  try {
    const [[lock]] = await connection.query('SELECT GET_LOCK(?,0) AS acquired', [lockName]);
    if (!Number(lock.acquired)) return { status: 'BUSY' };
    locked = true;
    const q = async (sql, params = []) => (await connection.query(sql, params))[0];
    const sources = await q(`SELECT s.*,g.enabled AS game_enabled,c.status AS community_status,UTC_TIMESTAMP(3) AS db_now
      FROM po_sources s JOIN po_games g ON g.id=s.game_id JOIN po_communities c ON c.id=s.community_id
      WHERE ${argv[0] === '--sync' ? "s.enabled=1 AND g.enabled=1 AND c.status='enabled'" : 's.id=?'}`, argv[1] ? [argv[1]] : []);
    if (argv[0] === '--sync') {
      const plan = sources.map(configuration);
      const filename = path.join(ROOT, 'state', `plan-${crypto.randomUUID()}.json`);
      fs.writeFileSync(filename, JSON.stringify(plan), { flag: 'wx' });
      try { return JSON.parse(powershell(['-File', path.join(ROOT, 'runtime/sync-source-check-tasks.ps1'), '-PlanFile', filename])); }
      finally { fs.unlinkSync(filename); }
    }
    const source = sources[0];
    if (!source) return { status: 'NOT_FOUND' };
    const slot = dueCheck(source, new Date(source.db_now.replace(' ', 'T') + 'Z'));
    if (!slot) return { sourceId: source.id, status: 'NOT_CHECK_TIME' };
    const runs = await q(`SELECT status,scheduled_at,started_at FROM po_sync_runs WHERE source_id=? AND parent_run_id IS NULL
      AND (status IN ('queued','running','paused','pausing','cancelling','awaiting_manual_verification') OR started_at>=? OR scheduled_at>=?)`, [source.id, slot.slice(0, 23).replace('T', ' '), slot.slice(0, 23).replace('T', ' ')]);
    const decision = recoveryDecision(source, runs, slot);
    if (source.collect_requested_at && decision === 'RECOVER' && source.id !== OVERSEAS) return { sourceId: source.id, scheduledAt: slot, status: 'ALREADY_REQUESTED' };
    if (source.id !== OVERSEAS && ['ACTIVE', 'RECOVER'].includes(decision)) {
      powershell(['-Command', "$s=Get-Service -Name PublicOpinionWorker; if($s.Status -eq 'Stopped'){Start-Service -Name PublicOpinionWorker}"]);
    }
    if (decision !== 'RECOVER') return { sourceId: source.id, scheduledAt: slot, status: decision };
    if (source.id === OVERSEAS) {
      // Use the installed task's exact guarded collector; never substitute the
      // shared Worker or bypass authorization/exclusion checks.
      const task = JSON.parse(powershell(['-Command', "$a=(Get-ScheduledTask -TaskName 'BigPlayer Last Night Overseas Daily 02').Actions; [pscustomobject]@{path=$a.Execute;args=$a.Arguments} | ConvertTo-Json -Compress"]));
      if (!task.path.toLowerCase().endsWith('\\wscript.exe')) throw new Error('OVERSEAS_HIDDEN_ACTION_REQUIRED');
      const quoted = [...task.args.matchAll(/"([^"]+)"/g)].map(match => match[1]);
      if (quoted.length !== 2 || !quoted[1].startsWith('C:\\ProgramData\\PublicOpinion\\overseas-daily\\releases\\')) throw new Error('OVERSEAS_ACTION_INVALID');
      execFileSync(task.path, ['//B', '//Nologo', ...quoted], { windowsHide: true, stdio: 'ignore', timeout: 3600000 });
      return { sourceId: source.id, scheduledAt: slot, status: 'OVERSEAS_RECOVERY_EXECUTED' };
    }
    // Existing request entry preserves the Worker authorization and admission
    // gates. No standalone crawler or credentials are introduced here.
    await repo.requestCollect(source.id);
    return { sourceId: source.id, scheduledAt: slot, status: 'RECOVERY_REQUESTED' };
  } finally {
    if (locked) await connection.query('SELECT RELEASE_LOCK(?)', [lockName]);
    connection.release();
    await repo.pool.end();
  }
}
if (require.main === module) main(process.argv.slice(2)).then(result => console.log(JSON.stringify(result))).catch(error => { console.error(JSON.stringify({ status: 'CHECK_FAILED', code: /^[A-Z0-9_]+$/.test(error.code || error.message || '') ? (error.code || error.message) : 'SOURCE_CHECK_FAILED' })); process.exitCode = 1; });
module.exports = { main };
