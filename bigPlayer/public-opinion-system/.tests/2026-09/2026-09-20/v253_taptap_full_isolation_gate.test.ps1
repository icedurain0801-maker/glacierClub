$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$source=Join-Path $root '.temp\taptap-stage-c-candidate-20260920\bigPlayer\public-opinion-system'
$stageC=Join-Path $root 'scripts\windows-services\prepare-taptap-worker-candidate.ps1'
$cli=Join-Path $root 'scripts\windows-services\worker-only-controlled-cutover.js'
$baseline='924fe1c848a69865f18c8e9e1c3c6a41794a8bab';$commit='627c4e928845cc5bbae60556cb6ae68d6a5aff11';$patchSha='4BCB47C89E32875D8F31E42708BDBCE4CC6B6094FFB8EA206D7E17C767077997';$lockSha='4CF97A1F34D59657664A262108B3909E7811B2128B56034F558CA51EA14977AB'
function Hash([string]$path){(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToUpperInvariant()}
function Require([bool]$ok,[string]$message){if(-not$ok){throw $message}}
$temp=Join-Path ([IO.Path]::GetTempPath()) ('po-taptap-full-isolation-'+[guid]::NewGuid().ToString('N'))
try {
  Require (Test-Path -LiteralPath $source -PathType Container) 'fixed TapTap SourceRoot is missing'
  Require (((@(& git -C $source status --porcelain)-join '').Trim()) -eq '') 'fixed TapTap SourceRoot is not clean'
  Require ((& git -C $source rev-parse HEAD).Trim() -eq $commit) 'fixed TapTap SourceRoot HEAD mismatch'
  Require ((& git -C $source rev-parse HEAD^).Trim() -eq $baseline) 'fixed TapTap SourceRoot parent mismatch'
  $envFile='C:\ProgramData\PublicOpinion\config\public-opinion.env';Require (Test-Path -LiteralPath $envFile -PathType Leaf) 'existing service env file is missing';Require (((Get-Item -LiteralPath $envFile -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)-eq 0) 'existing service env file is reparse'
  $data=Join-Path $temp 'data';$services=Join-Path $data 'services';New-Item -ItemType Directory -Path $services -Force|Out-Null
  foreach($name in @('PublicOpinionWorker.exe','PublicOpinionApi.exe','PublicOpinionApi.xml')){Copy-Item -LiteralPath (Join-Path 'C:\ProgramData\PublicOpinion\services' $name) -Destination (Join-Path $services $name) -Force}
  $workerXml='<service><env name="PUBLIC_OPINION_ENV_FILE" value="'+[Security.SecurityElement]::Escape($envFile)+'" /></service>';[IO.File]::WriteAllText((Join-Path $services 'PublicOpinionWorker.xml'),$workerXml,(New-Object Text.UTF8Encoding($false)))
  $winSw=Join-Path $data 'winsw.exe';Copy-Item -LiteralPath 'C:\ProgramData\PublicOpinion\services\PublicOpinionWorker.exe' -Destination $winSw -Force;$winSha=Hash $winSw
  $candidateId='worker-release-taptap-isogate-'+[guid]::NewGuid().ToString('N').Substring(0,12)
  $arguments=@('-NoProfile','-ExecutionPolicy','Bypass','-File',$stageC,'-Mode','Prepare','-Isolation','-ProgramDataRoot',$data,'-CandidateId',$candidateId,'-SourceRoot',$source,'-WinSWSource',$winSw,'-NodeExe',(Get-Command node.exe).Source,'-ConfigFile',$envFile,'-ExpectedBaselineCommit',$baseline,'-ExpectedCandidateCommit',$commit,'-ExpectedTapTapPatchSha256',$patchSha,'-ExpectedPackageLockSha256',$lockSha,'-PackageLockSource',(Join-Path $source 'package-lock.json'),'-IsolationWinSwSha256',$winSha)
  $cOutput=@(& powershell.exe @arguments 2>&1|ForEach-Object {"$_"});Require ($LASTEXITCODE-eq 0) ('Stage C isolation failed: '+($cOutput-join"`n"));$prepared=($cOutput|Where-Object {$_-match'^\{' }|Select-Object -Last 1)|ConvertFrom-Json;Require ($prepared.status-eq'PREPARED') 'Stage C did not report PREPARED'
  $snapshotPath=Join-Path (Join-Path $data "audit\$candidateId") 'verified-snapshot.json';$snapshot=Get-Content -Raw -LiteralPath $snapshotPath|ConvertFrom-Json
  Require ($snapshot.paths.envFile-eq$envFile) 'snapshot env-file is not the existing service file';Require ($snapshot.sha256.envFile-eq(Hash $envFile)) 'snapshot env-file hash mismatch';Require ((Get-Content -Encoding Byte -TotalCount 3 -LiteralPath $snapshotPath)-notcontains 239) 'snapshot must be UTF-8 without BOM'
  $manifest=Join-Path $prepared.release 'package-worker-release-manifest.json';$manifestJson=Get-Content -Raw -LiteralPath $manifest|ConvertFrom-Json;Require ($manifestJson.files.Count-eq405) "expected 405 Worker release files, got $($manifestJson.files.Count)";foreach($entry in $manifestJson.files){Require ((Hash (Join-Path $prepared.release $entry.path))-eq$entry.sha256.ToUpperInvariant()) "manifest hash mismatch: $($entry.path)"}
  $bArgs=@($cli,'--preflight','--controller=fake','--isolation-readiness')+$prepared.preflight+@('--fake-pinned-winsw-sha='+(Hash (Join-Path $prepared.services 'PublicOpinionWorker.exe')))
  $bOutput=@(& powershell.exe -NoProfile -Command '& $args[0] @args[1..($args.Count-1)]' (Get-Command node.exe).Source $bArgs 2>&1|ForEach-Object {"$_"});Require ($LASTEXITCODE-eq 0) ('B verifyInputs/readiness isolation failed: '+($bOutput-join"`n"));$bResult=($bOutput|Where-Object {$_-match'^\{' }|Select-Object -Last 1)|ConvertFrom-Json;Require ($bResult.status-eq'PASS'-and$bResult.apiUnchanged-eq$true) 'B output lacks read-only API invariant'
  [ordered]@{status='PASS';candidateId=$candidateId;sourceHead=$commit;releaseFileCount=$manifestJson.files.Count;candidateManifestSha256=(Hash $manifest);snapshotSha256=(Hash $snapshotPath);envFileSha256=(Hash $envFile);bMode=$bResult.mode;apiUnchanged=$bResult.apiUnchanged}|ConvertTo-Json -Compress
} finally {
  if(Test-Path -LiteralPath $temp){& node.exe -e "require('node:fs').rmSync(process.argv[1],{recursive:true,force:true,maxRetries:3})" $temp;if($LASTEXITCODE-ne 0-or(Test-Path -LiteralPath $temp)){throw "isolation residue remains: $temp"}}
}
