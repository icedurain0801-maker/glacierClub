<# Stage C only. Creates new candidate material; it never controls a service. #>
param(
 [ValidateSet('DryRun','Prepare')][string]$Mode='DryRun',
 [Parameter(Mandatory)][string]$CandidateId,[Parameter(Mandatory)][string]$SourceRoot,
 [Parameter(Mandatory)][string]$WinSWSource,[Parameter(Mandatory)][string]$NodeExe,[Parameter(Mandatory)][string]$ConfigFile,
 [Parameter(Mandatory)][string]$ExpectedBaselineCommit,[Parameter(Mandatory)][string]$ExpectedCandidateCommit,[Parameter(Mandatory)][string]$ExpectedTapTapPatchSha256,[Parameter(Mandatory)][string]$ExpectedPackageLockSha256,[Parameter(Mandatory)][string]$PackageLockSource,
 [string]$ProgramDataRoot='C:\ProgramData\PublicOpinion',[switch]$Isolation,[string]$IsolationWinSwSha256,[string]$CAndBConfirm,
 [ValidateSet('','hash','xml','snapshot','path')][string]$Fault=''
)
$ErrorActionPreference='Stop';$pin='05B82D46AD331CC16BDC00DE5C6332C1EF818DF8CEEFCD49C726553209B3A0DA'
function No([string]$m){throw "STAGE_C_REJECTED: $m"};function Full([string]$p){[IO.Path]::GetFullPath($p).TrimEnd('\')}
function File([string]$p,[string]$n){if(-not(Test-Path -LiteralPath $p -PathType Leaf)){No "$n missing"};$x=Get-Item -LiteralPath $p -Force;if(($x.Attributes-band[IO.FileAttributes]::ReparsePoint)-ne 0){No "$n is reparse"};$x.FullName}
function AssertDir([string]$p,[string]$n){if(-not(Test-Path -LiteralPath $p -PathType Container)){No "$n missing"};$x=Get-Item -LiteralPath $p -Force;if(($x.Attributes-band[IO.FileAttributes]::ReparsePoint)-ne 0){No "$n is reparse"};$x.FullName}
function Hash([string]$p){(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToUpperInvariant()}
function Child([string]$p,[string]$root,[string]$n){$f=Full $p;$r=Full $root;if(-not$f.StartsWith("$r\",[StringComparison]::OrdinalIgnoreCase)){No "$n outside approved root"};$f}
function GitGate([string]$Source){
 $repo=(& git -C $Source rev-parse --show-toplevel).Trim();if($LASTEXITCODE -ne 0){No 'SourceRoot is not in a Git checkout'}
 $prefix=(& git -C $Source rev-parse --show-prefix).Trim();if($LASTEXITCODE -ne 0){No 'SourceRoot Git prefix cannot be resolved'}
 $expectedPath=(($prefix.TrimEnd('/') + '/') + 'worker/src/worker.js').TrimStart('/')
 $s=& git -C $repo status --porcelain;if($LASTEXITCODE -ne 0 -or $s){No 'source checkout is not clean'}
 $h=(& git -C $repo rev-parse HEAD).Trim();if($LASTEXITCODE -ne 0 -or $h -ne $ExpectedCandidateCommit){No 'candidate commit mismatch'}
 $p=(& git -C $repo rev-parse "$ExpectedCandidateCommit^" ).Trim();if($LASTEXITCODE -ne 0 -or $p -ne $ExpectedBaselineCommit){No 'baseline commit mismatch'}
 $c=@(& git -C $repo diff --name-only "$ExpectedBaselineCommit..$ExpectedCandidateCommit");if($LASTEXITCODE -ne 0 -or $c.Count -ne 1 -or $c[0] -ne $expectedPath){No 'candidate is not a single Worker hunk'}
 $d=(& git -C $repo diff --binary "$ExpectedBaselineCommit..$ExpectedCandidateCommit"|Out-String);$sha=([BitConverter]::ToString(([Security.Cryptography.SHA256]::Create()).ComputeHash([Text.Encoding]::UTF8.GetBytes($d)))).Replace('-','');if($sha -ne $ExpectedTapTapPatchSha256.ToUpperInvariant()){No 'TapTap hunk hash mismatch'}
}
function WriteJson([string]$file,[object]$object){$tmp="$file.$([guid]::NewGuid().ToString('N')).tmp";$json=$object|ConvertTo-Json -Depth 8;[IO.File]::WriteAllText($tmp,$json,(New-Object Text.UTF8Encoding($false)));Move-Item -LiteralPath $tmp -Destination $file -Force}
if($CandidateId-notmatch'^worker-release-taptap-[A-Za-z0-9-]{8,80}$'){No 'CandidateId must be immutable worker-release-taptap-*'}
if($ExpectedBaselineCommit-notmatch'^[0-9a-fA-F]{40}$'-or$ExpectedCandidateCommit-notmatch'^[0-9a-fA-F]{40}$'-or$ExpectedTapTapPatchSha256-notmatch'^[0-9a-fA-F]{64}$'-or$ExpectedPackageLockSha256-notmatch'^[0-9a-fA-F]{64}$'){No 'commit IDs or input hashes invalid'}
if($Mode-eq'Prepare'-and-not$Isolation-and-not($env:PUBLIC_OPINION_STAGE_C_B_AUTHORIZED-eq'true'-and$CAndBConfirm-and$env:PUBLIC_OPINION_STAGE_C_B_CONFIRM-eq$CAndBConfirm)){No 'C_B_UNAUTHORIZED: a matching single-use C+B confirmation is required before any ProgramData write'};if($Fault-and-not$Isolation){No 'fault injection is isolation-only'}
$root=Full $ProgramDataRoot;if(-not$Isolation-and$root-ne'C:\ProgramData\PublicOpinion'){No 'ProgramDataRoot must be fixed'}
$source=AssertDir $SourceRoot 'SourceRoot';File $WinSWSource 'WinSW source'|Out-Null;$config=File $ConfigFile 'config file';$lockSource=File $PackageLockSource 'package lock source';if((Hash $lockSource)-ne$ExpectedPackageLockSha256.ToUpperInvariant()){No 'package lock hash mismatch'};$sourceLock=Join-Path $source 'package-lock.json';if(-not(Test-Path -LiteralPath $sourceLock)){if($Mode-eq'DryRun'){No 'package lock is absent from candidate checkout'};Copy-Item -LiteralPath $lockSource -Destination $sourceLock -ErrorAction Stop};File $sourceLock 'package lock'|Out-Null;if((Hash $sourceLock)-ne$ExpectedPackageLockSha256.ToUpperInvariant()){No 'package lock hash mismatch'};if($IsolationWinSwSha256-and-not$Isolation){No 'Isolation WinSW hash override requires -Isolation'};$expectedWinSw=if($Isolation -and $IsolationWinSwSha256){$IsolationWinSwSha256}else{$pin};if($expectedWinSw-notmatch'^[0-9a-fA-F]{64}$'-or(Hash $WinSWSource)-ne$expectedWinSw.ToUpperInvariant()){No 'WinSW hash mismatch'};GitGate $source
$base=Join-Path $root 'releases';$release=Child (Join-Path $base $CandidateId) $base 'candidate release';$stageBase=Join-Path $root 'candidate-staging';$stage=Child (Join-Path $stageBase $CandidateId) $stageBase 'candidate staging';$auditBase=Join-Path $root 'audit';$audit=Child (Join-Path $auditBase $CandidateId) $auditBase 'candidate audit';$services=Join-Path $stage 'services';$logs=Join-Path $stage 'logs';$data=Join-Path $stage 'data';$active=if($Isolation){Join-Path $root 'services'}else{'C:\ProgramData\PublicOpinion\services'}
$ww=File (Join-Path $active 'PublicOpinionWorker.exe') 'active Worker wrapper';$wx=File (Join-Path $active 'PublicOpinionWorker.xml') 'active Worker XML';$aw=File (Join-Path $active 'PublicOpinionApi.exe') 'active API wrapper';$ax=File (Join-Path $active 'PublicOpinionApi.xml') 'active API XML'
[xml]$activeWorkerXml=Get-Content -Raw -LiteralPath $wx;$activeWorkerEnv=@{};foreach($entry in $activeWorkerXml.service.env){$activeWorkerEnv[[string]$entry.name]=[string]$entry.value};$activeConfigValue=[string]$activeWorkerEnv['PUBLIC_OPINION_ENV_FILE'];if([string]::IsNullOrWhiteSpace($activeConfigValue)-or$activeConfigValue-match'%'){No 'active Worker PUBLIC_OPINION_ENV_FILE must be a rendered existing file'};$activeConfig=File $activeConfigValue 'active Worker environment file';if((Full $activeConfig)-ne(Full $config)){No 'ConfigFile does not match active Worker PUBLIC_OPINION_ENV_FILE'}
if((Test-Path -LiteralPath $release)-or(Test-Path -LiteralPath $stage)-or(Test-Path -LiteralPath $audit)){No 'candidate ID already exists; existing evidence is preserved'}
$pre=@(
 "--candidate-wrapper=$(Join-Path $services 'PublicOpinionWorker.exe')"
 "--candidate-xml=$(Join-Path $services 'PublicOpinionWorker.xml')"
 "--candidate-release=$release"
 "--worker-wrapper=$ww"
 "--worker-xml=$wx"
 "--api-wrapper=$aw"
 "--api-xml=$ax"
 "--verified-snapshot=$(Join-Path $audit 'verified-snapshot.json')"
 "--"
 "--env-file=$config"
)
if($Mode-eq'DryRun'){[ordered]@{status='DRY_RUN_PASS';candidateId=$CandidateId;release=$release;services=$services;audit=$audit;preflight=$pre}|ConvertTo-Json -Compress;exit 0}
New-Item -ItemType Directory -Path $audit -Force|Out-Null
try{
 if($Fault-eq'path'){No 'injected path failure'};if($Fault-eq'hash'){No 'injected hash failure'}
 $prepareArgs=@{Mode='Apply';AppRoot=$source;WinSWSource=$WinSWSource;NodeExe=$NodeExe;ConfigFile=$config;RuntimeRoot=$release;ReleaseBase=$base;ServiceRoot=$services;LogRoot=$logs;DataRoot=$data;PreserveFailedArtifacts=$true};if($Isolation){$prepareArgs.Isolation=$true;$prepareArgs.IsolationWinSwSha256=$IsolationWinSwSha256};& (Join-Path $PSScriptRoot 'prepare-worker-preflight.ps1') @prepareArgs;if(-not$?){No 'Worker candidate preparation failed'}
 $cw=File (Join-Path $services 'PublicOpinionWorker.exe') 'candidate Worker wrapper';$cx=File (Join-Path $services 'PublicOpinionWorker.xml') 'candidate Worker XML';$mf=File (Join-Path $release 'package-worker-release-manifest.json') 'candidate manifest';if($Fault-eq'xml'){No 'injected XML failure'}
 [xml]$xml=Get-Content -Raw -LiteralPath $cx;if($xml.service.id-ne'PublicOpinionWorker'-or$xml.service.arguments-ne('"'+(Join-Path $release 'worker\src\worker.js')+'"')-or$xml.service.arguments-match'PublicOpinionApi|3001'){No 'candidate XML is not Worker-only'};$env=@{};foreach($entry in $xml.service.env){$env[[string]$entry.name]=[string]$entry.value};if($env['BUILD_SHA']-ne(Hash $mf)){No 'candidate XML BUILD_SHA mismatch'};if($Fault-eq'snapshot'){No 'injected snapshot failure'}
 $snapshot=[ordered]@{version=1;service='PublicOpinionWorker';candidateId=$CandidateId;createdAtUtc=[DateTime]::UtcNow.ToString('o');paths=[ordered]@{candidateRelease=$release;candidateWrapper=$cw;candidateXml=$cx;workerWrapper=$ww;workerXml=$wx;apiWrapper=$aw;apiXml=$ax;envFile=$config};sha256=[ordered]@{candidateManifest=(Hash $mf);candidateWrapper=(Hash $cw);candidateXml=(Hash $cx);workerWrapper=(Hash $ww);workerXml=(Hash $wx);apiWrapper=(Hash $aw);apiXml=(Hash $ax);envFile=(Hash $config);packageLock=(Hash (Join-Path $source 'package-lock.json'))};source=[ordered]@{baselineCommit=$ExpectedBaselineCommit;candidateCommit=$ExpectedCandidateCommit;tapTapPatchSha256=$ExpectedTapTapPatchSha256}};WriteJson (Join-Path $audit 'verified-snapshot.json') $snapshot
 [ordered]@{status='PREPARED';candidateId=$CandidateId;preflight=$pre}|ConvertTo-Json -Compress
}catch{if(Test-Path -LiteralPath $audit){[ordered]@{status='FAILED';candidateId=$CandidateId;message=$_.Exception.Message;timeUtc=[DateTime]::UtcNow.ToString('o')}|ConvertTo-Json -Compress|Set-Content -LiteralPath (Join-Path $audit 'failure.json') -Encoding utf8};throw}
