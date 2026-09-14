$ErrorActionPreference='Stop'
$taskAppRoot=Split-Path -Parent $PSScriptRoot
$taskFile=Join-Path $taskAppRoot 'data\launcher.json'
if(-not(Test-Path -LiteralPath $taskFile)){Write-Host 'No service started by this launcher was found. If started in a terminal, press Ctrl+C there.';exit}
$taskInfo=Get-Content -LiteralPath $taskFile -Raw | ConvertFrom-Json
$taskProcess=Get-Process -Id ([int]$taskInfo.pid) -ErrorAction SilentlyContinue
if($taskProcess -and $taskProcess.ProcessName -eq 'node' -and $taskProcess.Path -eq $taskInfo.nodePath -and $taskProcess.StartTime.ToUniversalTime().ToString('o') -eq $taskInfo.startedAt){Stop-Process -Id $taskProcess.Id;Write-Host 'Component Hub stopped. All saved inventory remains on disk.'}else{Write-Host 'No matching Component Hub service is running.'}
