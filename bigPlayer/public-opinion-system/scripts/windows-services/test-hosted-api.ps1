param([string]$Origin = 'https://chat.q1.com')
$ErrorActionPreference = 'Stop'
# Read-only checks. Do not use credentials, hosts overrides or TLS bypasses.
$api = (& node -e "process.stdout.write(require('./scripts/verify-baas-frontend.cjs').HOSTED_API)")
if ($LASTEXITCODE -ne 0) { throw 'Cannot load hosting API contract; run from project root' }
$gateway = [Uri]$api
$records = @(Resolve-DnsName -Name $gateway.Host -Type A -NoHostsFile -DnsOnly)
$addresses = @($records | Where-Object { $_.IPAddress } | ForEach-Object { $_.IPAddress })
if (-not $addresses.Count) { throw 'Gateway has no DNS A record independent of hosts' }
foreach ($address in $addresses) {
    if ([Net.IPAddress]::IsLoopback([Net.IPAddress]::Parse($address))) { throw 'Gateway resolves to loopback' }
}
$config = Invoke-WebRequest -UseBasicParsing -Uri "$api/auth/config" -Headers @{ Origin = $Origin } -TimeoutSec 15
if ($config.StatusCode -ne 200) { throw 'Authentication config is unavailable' }
$preflight = Invoke-WebRequest -UseBasicParsing -Method Options -Uri "$api/auth/session" -Headers @{
    Origin = $Origin
    'Access-Control-Request-Method' = 'GET'
    'Access-Control-Request-Headers' = 'authorization'
} -TimeoutSec 15
if ($preflight.StatusCode -notin @(200,204)) { throw 'Cross-origin preflight failed' }
$allowedOrigin = $preflight.Headers['Access-Control-Allow-Origin']
if ($allowedOrigin -notin @('*',$Origin)) { throw 'Cross-origin origin is not permitted' }
$allowedHeaders = $preflight.Headers['Access-Control-Allow-Headers']
$corsFailures = [System.Collections.Generic.List[string]]::new()
if ($allowedHeaders -notmatch '(?i)(^|[,\s])authorization([,\s]|$)') { $corsFailures.Add('Bearer Authorization must be explicitly permitted; wildcard does not cover Authorization') }
foreach ($method in @('GET','POST','PUT','PATCH','DELETE')) {
    $check = Invoke-WebRequest -UseBasicParsing -Method Options -Uri "$api/sources/preflight-only/configuration" -Headers @{
        Origin = $Origin
        'Access-Control-Request-Method' = $method
        'Access-Control-Request-Headers' = 'authorization,content-type'
    } -TimeoutSec 15
    $methods = [string]$check.Headers['Access-Control-Allow-Methods']
    $headers = [string]$check.Headers['Access-Control-Allow-Headers']
    $checkOrigin = [string]$check.Headers['Access-Control-Allow-Origin']
    if ($checkOrigin -notin @('*',$Origin)) { $corsFailures.Add("Cross-origin origin rejected for $method") }
    if (($methods -split '\s*,\s*') -notcontains $method) { $corsFailures.Add("Gateway does not permit $method; browser request would be blocked") }
    foreach ($header in @('authorization','content-type')) {
        if (($headers.ToLowerInvariant() -split '\s*,\s*') -notcontains $header) { $corsFailures.Add("Gateway does not explicitly permit $header for $method") }
    }
}
if ($corsFailures.Count) { throw ($corsFailures -join '; ') }
try {
    $null = Invoke-WebRequest -UseBasicParsing -Uri "$api/auth/session" -Headers @{ Origin = $Origin; Authorization = 'Bearer invalid-hosting-preflight-token' } -TimeoutSec 15
    throw 'Invalid bearer unexpectedly succeeded'
} catch {
    if (-not $_.Exception.Response -or [int]$_.Exception.Response.StatusCode -ne 401) { throw }
}
[PSCustomObject]@{
    api = $api; dnsWithoutHosts = $addresses; configStatus = $config.StatusCode
    preflightStatus = $preflight.StatusCode; invalidBearerStatus = 401
    scope = 'This computer only; verify browser access on recipient network before hosting approval'
} | ConvertTo-Json
