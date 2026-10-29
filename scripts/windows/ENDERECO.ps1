# Ajusta o endereço público do painel e o remetente dos e-mails no .env.local e reinicia o painel. Dê dois cliques em CONFIGURAR-ENDERECO.bat.
$ErrorActionPreference = 'Stop'
$id = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $id.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { Start-Process powershell -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""; exit }
try {
  $f = 'C:\painel-contabil\.env.local'
  $linhas = Get-Content $f | Where-Object { $_ -notmatch '^(APP_URL|EMAIL_FROM|TRUST_PROXY)=' }
  $linhas += 'APP_URL=https://lucas.tail0995ea.ts.net'
  $linhas += 'EMAIL_FROM="Contvoo Contabilidade <avisos@contvoocontabilidade.com.br>"'
  [IO.File]::WriteAllLines($f, $linhas, (New-Object Text.UTF8Encoding($false)))
  Stop-ScheduledTask -TaskName 'Painel Contvoo' -ErrorAction SilentlyContinue
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*next*start*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Start-Sleep 3; Start-ScheduledTask -TaskName 'Painel Contvoo'; Start-Sleep 10
  Write-Host 'Pronto: endereço do painel = https://lucas.tail0995ea.ts.net' -ForegroundColor Green
} catch { Write-Host "`nERRO: $($_.Exception.Message)" -ForegroundColor Red }
Read-Host "`nTecle Enter para fechar"
