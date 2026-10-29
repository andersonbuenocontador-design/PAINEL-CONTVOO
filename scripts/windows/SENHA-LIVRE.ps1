# Liga a opção "senha livre" (aceita qualquer senha com 10+ caracteres) e reinicia o painel. Dê dois cliques em SENHA-LIVRE.bat.
$ErrorActionPreference = 'Stop'
$id = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $id.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { Start-Process powershell -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""; exit }
try {
  $f = 'C:\painel-contabil\.env.local'
  $linhas = Get-Content $f | Where-Object { $_ -notmatch '^SENHA_POLITICA_BRANDA=' }; $linhas += 'SENHA_POLITICA_BRANDA=1'
  [IO.File]::WriteAllLines($f, $linhas, (New-Object Text.UTF8Encoding($false)))
  Stop-ScheduledTask -TaskName 'Painel Contvoo' -ErrorAction SilentlyContinue
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*next*start*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Start-Sleep 3; Start-ScheduledTask -TaskName 'Painel Contvoo'; Start-Sleep 10
  Write-Host 'Pronto: o painel aceita senhas com 10 ou mais caracteres, sem checar palavras comuns.' -ForegroundColor Green
} catch { Write-Host "`nERRO: $($_.Exception.Message)" -ForegroundColor Red }
Read-Host "`nTecle Enter para fechar"
