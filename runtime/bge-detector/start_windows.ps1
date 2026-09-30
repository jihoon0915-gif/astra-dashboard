$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
python server.py --device cuda --port 18768
