param([ValidateSet('disconnected','test','model')][string]$Mode='disconnected',[int]$Port=8769,[switch]$Review,[string]$DetectorPath='')
$ErrorActionPreference='Stop'
$taskRoot=Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location -LiteralPath $taskRoot
$taskPython=Join-Path $taskRoot '.venv-rag-pilot/Scripts/python.exe'
if (-not(Test-Path -LiteralPath $taskPython)) {$taskPython=(Get-Command python).Source}
if ($Review) {
 $taskKeyPath=Join-Path $taskRoot 'work/internal-review.key'
 if (-not(Test-Path -LiteralPath $taskKeyPath)) {New-Item -ItemType Directory -Force work | Out-Null; $taskBytes=New-Object byte[] 32;[Security.Cryptography.RandomNumberGenerator]::Fill($taskBytes);[Convert]::ToBase64String($taskBytes)|Set-Content -LiteralPath $taskKeyPath -NoNewline}
 $env:ASTRA_REVIEW_KEY=(Get-Content -LiteralPath $taskKeyPath -Raw).Trim()
 Write-Output 'Internal review enabled. Read work/internal-review.key locally; never commit or place in URL.'
}
if ($Mode -eq 'model') {
 $taskProfile=Get-Content work/rag-pilot/active_generation.json -Raw -Encoding utf8|ConvertFrom-Json
 $env:ASTRA_MODEL_URL='http://127.0.0.1:18767';$env:ASTRA_MODEL_ALIAS=$taskProfile.alias
 $env:ASTRA_MODEL_TOKEN=(Get-Content work/rag-pilot/server.token -Raw).Trim()
}
if ($DetectorPath) {$env:ASTRA_DETECTOR_PATH=(Resolve-Path -LiteralPath $DetectorPath).Path}
& $taskPython demo-ui/spatial-poc/integrated_server.py --port $Port --generator $Mode
exit $LASTEXITCODE
