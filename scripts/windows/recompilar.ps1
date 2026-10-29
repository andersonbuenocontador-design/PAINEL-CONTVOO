# Recompila o painel no modo compatível com Windows (webpack) e reinicia o serviço. Dê dois cliques em CORRIGIR-PAINEL.bat.
$ErrorActionPreference = 'Stop'
$id = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $id.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { Start-Process powershell -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""; exit }
try {
  $App = 'C:\painel-contabil'; Set-Location $App
  $env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
  Write-Host '== Parando o painel' -ForegroundColor Cyan
  Stop-ScheduledTask -TaskName 'Painel Contvoo' -ErrorAction SilentlyContinue
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*next*start*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Start-Sleep 3
  Write-Host '== Recompilando (alguns minutos)' -ForegroundColor Cyan
  Remove-Item "$App\.next" -Recurse -Force -ErrorAction SilentlyContinue
  npx next build --webpack; if ($LASTEXITCODE) { throw 'build falhou' }
  Write-Host '== Iniciando o painel' -ForegroundColor Cyan
  Start-ScheduledTask -TaskName 'Painel Contvoo'; Start-Sleep 10
  Invoke-RestMethod 'http://127.0.0.1:3100/api/saude' | ConvertTo-Json -Compress
  $r = (Invoke-WebRequest 'http://127.0.0.1:3100/login' -UseBasicParsing).StatusCode
  Write-Host "Tela de login: HTTP $r" -ForegroundColor Green
  Write-Host 'Pronto. Abra http://127.0.0.1:3100/login' -ForegroundColor Green
} catch { Write-Host "`nERRO: $($_.Exception.Message)" -ForegroundColor Red; Write-Host "Veja C:\painel-contabil\logs\app.log" }
Read-Host "`nTecle Enter para fechar"
