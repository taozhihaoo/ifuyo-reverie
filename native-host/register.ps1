# Registers the Reverie Capture Host for Chrome and Edge (per-user, HKCU only).
# Native messaging manifests must contain absolute paths, so we materialize a
# per-browser copy under native-host/data/ (gitignored) and point the registry
# at it. Usage:
#   powershell -ExecutionPolicy Bypass -File register.ps1
param(
    [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

$ErrorActionPreference = "Stop"

$hostName = "com.reverie.capture_host"
$dataDir = Join-Path $RepoRoot "native-host\data"
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null

$template = Get-Content (Join-Path $RepoRoot "native-host\com.reverie.capture_host.json") -Raw | ConvertFrom-Json
$template.path = (Join-Path $RepoRoot "native-host\run-host.cmd")
$manifestPath = Join-Path $dataDir "$hostName.json"
$template | ConvertTo-Json | Set-Content -Encoding UTF8 $manifestPath

$targets = @(
    @{ Key = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$hostName"; Browser = "Chrome" },
    @{ Key = "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\$hostName"; Browser = "Edge" }
)

foreach ($t in $targets) {
    New-Item -Path $t.Key -Force | Out-Null
    Set-ItemProperty -Path $t.Key -Name "(default)" -Value $manifestPath
    Write-Host "$($t.Browser): registered -> $manifestPath"
}

Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Open chrome://extensions (or edge://extensions), enable Developer mode"
Write-Host "  2. 'Load unpacked' -> select the extension/ folder"
Write-Host "     (the fixed key pins the extension ID to ngfmioeinapcphpbgboaajachhhdgajg)"
Write-Host "  3. Click the Reverie action icon on any http(s) page; the badge shows OK/ERR"
