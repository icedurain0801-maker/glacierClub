param(
    [string]$StateDirectory = 'E:\CodexData\public-opinion\maintenance\api-health-guard',
    [switch]$AllowRecovery
)
$ErrorActionPreference = 'Stop'
# Only the API is eligible for recovery; manual stops, DB and workers are untouched.
$mutex = New-Object System.Threading.Mutex($false, 'Global\PublicOpinionApiHealthGuard')
if (-not $mutex.WaitOne(0)) { exit 0 }
try {
    New-Item -ItemType Directory -Path $StateDirectory -Force | Out-Null
    $stateFile = Join-Path $StateDirectory 'state.json'
    $state = @{ failures = 0; recoveries = @(); lastStatus = 'unknown' }
    if (Test-Path -LiteralPath $stateFile) {
        try { $state = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json -AsHashtable } catch { throw 'Guard state is unreadable; refusing automatic restart' }
    }
    $now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    $state.recoveries = @($state.recoveries | Where-Object { $now - [long]$_ -lt 3600 })
    $service = Get-Service -Name PublicOpinionApi
    if ($service.Status -ne 'Running') { $state.failures = 0; $state.lastStatus = 'service-not-running-no-action' }
    else {
        $healthy = $false
        try {
            $ready = Invoke-RestMethod -Uri 'http://127.0.0.1:4320/readyz' -TimeoutSec 5
            $auth = Invoke-WebRequest -Uri 'http://127.0.0.1:4320/api/public-opinion/auth/config' -TimeoutSec 5
            $config = $auth.Content | ConvertFrom-Json
            $healthy = $ready.data.ready -eq $true -and $auth.StatusCode -eq 200 -and $config.data.enabled -is [bool]
        } catch { $healthy = $false }
        if ($healthy) { $state.failures = 0; $state.lastStatus = 'healthy' }
        else {
            $state.failures = [int]$state.failures + 1
            $state.lastStatus = 'unhealthy'
            $lastRecovery = if ($state.recoveries.Count) { [long]$state.recoveries[-1] } else { 0 }
            $databaseListening = $false
            $client = New-Object System.Net.Sockets.TcpClient
            try { $connect = $client.ConnectAsync('127.0.0.1', 3306); $databaseListening = $connect.Wait(1000) -and $client.Connected } catch {} finally { $client.Dispose() }
            if ($state.failures -ge 3 -and $databaseListening -and $AllowRecovery -and $state.recoveries.Count -lt 2 -and $now - $lastRecovery -ge 600) {
                # Persist the limit before attempting recovery, including failed attempts.
                $state.recoveries += $now
                $state.lastStatus = 'recovery-attempt'
                $state | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $stateFile -Encoding utf8
                Restart-Service -Name PublicOpinionApi -ErrorAction Stop
                $state.failures = 0
            } elseif ($state.failures -ge 3) { $state.lastStatus = 'unhealthy-recovery-limited-or-observe-only' }
        }
    }
    $state.checkedAt = [DateTimeOffset]::UtcNow.ToString('o')
    $state | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $stateFile -Encoding utf8
    Write-Output ($state | ConvertTo-Json -Compress)
} finally { $mutex.ReleaseMutex(); $mutex.Dispose() }
