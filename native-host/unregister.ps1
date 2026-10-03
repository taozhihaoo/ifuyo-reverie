# Removes the per-user Native Messaging registry entries created by register.ps1.
$hostName = "com.reverie.capture_host"
foreach ($key in @(
    "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$hostName",
    "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\$hostName"
)) {
    if (Test-Path $key) {
        Remove-Item $key -Force
        Write-Host "removed $key"
    } else {
        Write-Host "not present: $key"
    }
}
