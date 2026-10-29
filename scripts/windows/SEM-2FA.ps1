# Desliga a exigência de 2FA para administradores (continua opcional) e reinicia o painel. Dê dois cliques em SEM-2FA.bat.
$ErrorActionPreference = 'Stop'
$id = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $id.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { Start-Process powershell -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""; exit }
try {
  $f = 'C:\painel-contabil\.env.local'
  $linhas = Get-Content $f | Where-Object { $_ -notmatch '^EXIGIR_2FA_ADMIN=' }; $linhas += 'EXIGIR_2FA_ADMIN=0'
  [IO.File]::WriteAllLines($f, $linhas, (New-Object Text.UTF8Encoding($false)))
  Stop-ScheduledTask -TaskName 'Painel Contvoo' -ErrorAction SilentlyContinue
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*next*start*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Start-Sleep 3; Start-ScheduledTask -TaskName 'Painel Contvoo'; Start-Sleep 10
  Write-Host 'Pronto: o 2FA deixou de ser obrigatório para administradores (continua disponível, se quiser ativar).' -ForegroundColor Green
} catch { Write-Host "`nERRO: $($_.Exception.Message)" -ForegroundColor Red }
Read-Host "`nTecle Enter para fechar"
