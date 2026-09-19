param([ValidateSet('qwen2.5-1.5b','qwen3-4b')][string]$GenerationModel='qwen3-4b')
$ErrorActionPreference = 'Stop'
$pilotRoot = Split-Path -Parent $PSScriptRoot
$pilotWork = Join-Path $pilotRoot 'work/rag-pilot'
$pilotExe = Join-Path $pilotWork 'llama-b10938/llama-server.exe'
$pilotPidFile = Join-Path $pilotWork 'server.pid'
if (Test-Path -LiteralPath $pilotPidFile) {
    $pilotOldPid = [int](Get-Content -LiteralPath $pilotPidFile)
    $pilotOldProcess = Get-Process -Id $pilotOldPid -ErrorAction SilentlyContinue
    if ($pilotOldProcess -and $pilotOldProcess.Path -eq $pilotExe) {
        throw 'This pilot server is already running. Stop that process before changing profiles.'
    }
}
$pilotProfiles = Get-Content -LiteralPath (Join-Path $pilotRoot 'project-docs/RAG파일럿/v1/runtime/generation_profiles.json') -Raw -Encoding utf8 | ConvertFrom-Json
$pilotProfile = $pilotProfiles.PSObject.Properties[$GenerationModel].Value
$pilotModel = Join-Path $pilotWork $pilotProfile.model_path
if ((Get-FileHash -LiteralPath $pilotModel -Algorithm SHA256).Hash.ToLowerInvariant() -ne $pilotProfile.model_sha256) {
    throw 'Generation model hash mismatch'
}
$pilotProfile | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $pilotWork 'active_generation.json') -Encoding utf8
$pilotKey = Join-Path $pilotWork 'server.token'
if (-not (Test-Path -LiteralPath $pilotKey)) {
    $pilotBytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($pilotBytes)
    [Convert]::ToBase64String($pilotBytes) | Set-Content -LiteralPath $pilotKey -NoNewline
}
$pilotArguments = @('-m', $pilotProfile.model_path, '--alias', $pilotProfile.alias,
    '--host', '127.0.0.1', '--port', '18767', '-c', $pilotProfile.context, '-np', '1',
    '-t', '8', '-tb', '8', '-b', '128', '-ub', '32', '--cache-ram', '0',
    '-fa', 'on', '--cache-type-k', $pilotProfile.cache_type, '--cache-type-v', $pilotProfile.cache_type,
    '--no-cache-prompt', '--no-context-shift', '--no-webui',
    '--api-key-file', 'server.token', '--cors-origins', 'http://127.0.0.1:18767', '--no-cors-credentials')
$pilotProcess = Start-Process -FilePath $pilotExe -ArgumentList $pilotArguments -WorkingDirectory $pilotWork -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $pilotWork 'server.stdout.log') `
    -RedirectStandardError (Join-Path $pilotWork 'server.stderr.log')
$pilotProcess.Id | Set-Content (Join-Path $pilotWork 'server.pid')
Write-Output "Local server PID: $($pilotProcess.Id). Bound only to 127.0.0.1:18767."
