param(
    [Parameter(Mandatory)][string]$ReleaseRoot,
    [Parameter(Mandatory)][string]$ReleaseBase,
    [string]$ServiceRoot
)

$ErrorActionPreference = 'Stop'
$base = [System.IO.Path]::GetFullPath($ReleaseBase).TrimEnd('\')
$release = [System.IO.Path]::GetFullPath($ReleaseRoot).TrimEnd('\')
$parent = [System.IO.Path]::GetFullPath((Split-Path -Parent $release)).TrimEnd('\')
if ($parent -ne $base -or $release -eq $base) {
    throw "Refusing release cleanup outside release base: $release"
}
if (Test-Path -LiteralPath $release) {
    & node.exe -e "require('node:fs').rmSync(process.argv[1], { recursive: true, force: true, maxRetries: 3 })" $release
    if ($LASTEXITCODE -ne 0) { throw "Release cleanup failed with exit code $LASTEXITCODE" }
}
if ($ServiceRoot) {
    $services = [System.IO.Path]::GetFullPath($ServiceRoot).TrimEnd('\')
    foreach ($name in @('PublicOpinionApi.exe', 'PublicOpinionApi.xml')) {
        $artifact = [System.IO.Path]::GetFullPath((Join-Path $services $name))
        if ([System.IO.Path]::GetFullPath((Split-Path -Parent $artifact)).TrimEnd('\') -ne $services) {
            throw "Refusing service artifact cleanup outside service root: $artifact"
        }
        if (Test-Path -LiteralPath $artifact) { [System.IO.File]::Delete($artifact) }
    }
}
