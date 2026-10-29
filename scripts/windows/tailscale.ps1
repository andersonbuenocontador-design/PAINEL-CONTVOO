# Publica o painel na internet com Tailscale Funnel (grátis, endereço fixo https://...ts.net). Dê dois cliques em LIGAR-TAILSCALE.bat.
$ErrorActionPreference = 'Stop'
$id = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $id.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { Start-Process powershell -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""; exit }
function Achar-Ts { $c = (Get-Command tailscale -ErrorAction SilentlyContinue).Source; if ($c) { return $c }
  foreach ($d in "$env:ProgramFiles\Tailscale\tailscale.exe", "${env:ProgramFiles(x86)}\Tailscale\tailscale.exe") { if (Test-Path $d) { return $d } }; return $null }
try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  $ts = Achar-Ts
  if (-not $ts) {
    Write-Host '== Instalando o Tailscale' -ForegroundColor Cyan
    $dl = 'C:\painel-instalar-temp'; New-Item -ItemType Directory -Force -Path $dl | Out-Null
    Remove-Item "$dl\tailscale.msi" -Force -ErrorAction SilentlyContinue
    & curl.exe -L --fail --silent --show-error -o "$dl\tailscale.msi" 'https://pkgs.tailscale.com/stable/tailscale-setup-latest-amd64.msi'
    if ($LASTEXITCODE -or (Get-Item "$dl\tailscale.msi").Length -lt 5MB) { throw 'Não consegui baixar o Tailscale (internet/antivírus).' }
    $r = Start-Process msiexec.exe -ArgumentList "/i `"$dl\tailscale.msi`" /qn /norestart" -Wait -PassThru
    if ($r.ExitCode -notin 0, 3010) { throw "Instalação do Tailscale falhou (código $($r.ExitCode))." }
    Start-Sleep 5; $ts = Achar-Ts; if (-not $ts) { throw 'Tailscale não encontrado após instalar. Reinicie o computador e rode de novo.' }
  }
  Write-Host "`n== Entrando na sua conta Tailscale" -ForegroundColor Cyan
  Write-Host 'Vai abrir uma página no navegador: entre (ou crie a conta grátis) com Google/Microsoft e aprove este computador.' -ForegroundColor Yellow
  & $ts up --unattended
  Write-Host "`n== Ligando o Funnel (painel na internet)" -ForegroundColor Cyan
  Write-Host 'Se aparecer um link https://login.tailscale.com/..., abra-o, clique para ATIVAR o Funnel/HTTPS e rode este atalho de novo.' -ForegroundColor Yellow
  & $ts funnel --bg 3100
  Start-Sleep 3
  Write-Host "`n== Endereço do painel" -ForegroundColor Cyan
  & $ts funnel status
  Write-Host "`nAbra o endereço https://....ts.net mostrado acima (o primeiro acesso pode levar 1 a 2 minutos)." -ForegroundColor Green
} catch { Write-Host "`nERRO: $($_.Exception.Message)" -ForegroundColor Red }
Read-Host "`nTecle Enter para fechar"
