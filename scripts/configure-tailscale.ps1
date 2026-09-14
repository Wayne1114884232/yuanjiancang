$ErrorActionPreference='Stop'
$taskPrincipal=New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if(-not $taskPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){
  $taskArguments="-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
  Start-Process powershell.exe -Verb RunAs -Wait -ArgumentList $taskArguments
  exit
}
$taskAppRoot=Split-Path -Parent $PSScriptRoot
$taskTailscale=(Get-Command tailscale.exe -ErrorAction SilentlyContinue).Source
if(-not $taskTailscale){
  $taskCandidate='C:\Program Files\Tailscale\tailscale.exe'
  if(Test-Path -LiteralPath $taskCandidate){$taskTailscale=$taskCandidate}
}
if(-not $taskTailscale){throw 'Tailscale is not installed.'}
$taskStatus=& $taskTailscale status --json | ConvertFrom-Json
if(-not $taskStatus.Self.DNSName){throw 'Open Tailscale and sign in first.'}
$taskDnsName=$taskStatus.Self.DNSName.TrimEnd('.')
& $taskTailscale funnel --bg 4186
if($LASTEXITCODE -ne 0){throw 'Tailscale Funnel could not start. Approve the authorization page if one was shown, then run this file again.'}
$taskConfigDir=Join-Path $taskAppRoot 'data'
New-Item -ItemType Directory -Path $taskConfigDir -Force | Out-Null
$taskPublicUrl="https://$taskDnsName"
Set-Content -LiteralPath (Join-Path $taskConfigDir 'public-url.txt') -Value $taskPublicUrl -Encoding ascii
Write-Host "Free public access configured: $taskPublicUrl"
