$ErrorActionPreference='Stop'
$taskAppRoot=Split-Path -Parent $PSScriptRoot
if(-not(Get-Command node.exe -ErrorAction SilentlyContinue)){
  Write-Host 'Node.js 20 or newer is required: https://nodejs.org/'
  exit 1
}
$taskConfigFile=Join-Path $taskAppRoot 'data\public-url.txt'
if(-not(Test-Path -LiteralPath $taskConfigFile)){
  Write-Host 'Free public access has not been configured yet.'
  Write-Host 'Run Configure Free Public Access as administrator first.'
  exit 1
}
$taskPublicUrl=(Get-Content -LiteralPath $taskConfigFile -Raw).Trim().TrimEnd('/')
$taskUri=[Uri]$taskPublicUrl
if($taskUri.Scheme -ne 'https' -or -not $taskUri.Host.EndsWith('.ts.net')){throw 'The saved Tailscale public URL is invalid.'}
$taskDnsName=$taskUri.Host
$env:PORT='4186'
$env:HOST='127.0.0.1'
$env:PUBLIC_URL=$taskPublicUrl
$env:PUBLIC_HOSTS=$taskDnsName
$env:PUBLIC_ACCESS='false'
Write-Host "Component Hub public link: $taskPublicUrl"
Write-Host 'Inventory stays on this computer. Keep this window and the computer online while using the phone.'
Start-Process $taskPublicUrl
& node.exe --no-warnings (Join-Path $taskAppRoot 'server.mjs')

