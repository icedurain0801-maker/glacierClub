param(
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$ServiceName,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$WrapperPath,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$XmlPath
)

$ErrorActionPreference = 'Stop'
$wrapper = [IO.Path]::GetFullPath($WrapperPath)
$xml = [IO.Path]::GetFullPath($XmlPath)
$service = Get-Service -Name $ServiceName -ErrorAction Stop

if ($service.Status -ne [ServiceProcess.ServiceControllerStatus]::Stopped) {
    exit 20
}

$xmlDocument = [xml][IO.File]::ReadAllText($xml)
$arguments = [string]$xmlDocument.service.arguments
$tokens = [regex]::Matches($arguments, '(?:"[^"]+"|\S+)') | ForEach-Object { $_.Value.Trim('"') }
$entry = $tokens |
    Where-Object { $_.EndsWith('worker\src\worker.js', [StringComparison]::OrdinalIgnoreCase) } |
    Select-Object -First 1
$processes = Get-CimInstance Win32_Process -ErrorAction Stop
$busy = $processes | Where-Object {
    ($_.ExecutablePath -and [IO.Path]::GetFullPath($_.ExecutablePath) -ieq $wrapper) -or
    ($entry -and $_.CommandLine -and $_.CommandLine.IndexOf($entry, [StringComparison]::OrdinalIgnoreCase) -ge 0)
}

if ($busy) {
    exit 21
}

$handles = @()
try {
    $handles += [IO.File]::Open($wrapper, 'Open', 'ReadWrite', 'None')
    $handles += [IO.File]::Open($xml, 'Open', 'ReadWrite', 'None')
} catch {
    exit 22
} finally {
    $handles | ForEach-Object { $_.Dispose() }
}

Write-Output 'SAFE'
