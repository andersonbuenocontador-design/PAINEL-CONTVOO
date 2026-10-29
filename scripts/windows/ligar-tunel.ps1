# Liga o Cloudflare Tunnel: pergunta o token e instala o serviço (inicia com o Windows). Dê dois cliques em LIGAR-TUNEL.bat.
$ErrorActionPreference = 'Stop'
$id = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $id.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { Start-Process powershell -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""; exit }
try {
  $env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
  $cf = (Get-Command cloudflared -ErrorAction SilentlyContinue).Source
  if (-not $cf) { foreach ($d in "$env:ProgramFiles\cloudflared\cloudflared.exe", "${env:ProgramFiles(x86)}\cloudflared\cloudflared.exe") { if (Test-Path $d) { $cf = $d; break } } }
  if (-not $cf) { throw 'cloudflared não encontrado. Rode o INSTALAR-PAINEL.bat primeiro.' }
  $tk = Read-Host 'Cole o TOKEN do túnel (texto longo que começa com eyJ) e tecle Enter'
  $tk = ($tk -replace '^.*(eyJ[A-Za-z0-9_\-=\.]+).*$', '$1').Trim()
  if ($tk.Length -lt 40) { throw 'Token inválido ou vazio.' }
  if (Get-Service 'Cloudflared' -ErrorAction SilentlyContinue) { & $cf service uninstall 2>$null | Out-Null; Start-Sleep 3 }
  & $cf service install $tk; if ($LASTEXITCODE) { throw 'Falha ao instalar o serviço do túnel.' }
  Start-Sleep 8
  $s = Get-Service 'Cloudflared' -ErrorAction SilentlyContinue
  Write-Host "Serviço do túnel: $($s.Status)" -ForegroundColor Green
  Write-Host 'Agora abra https://painel.contvoocontabilidade.com.br (pode levar 1 a 2 minutos).' -ForegroundColor Green
} catch { Write-Host "`nERRO: $($_.Exception.Message)" -ForegroundColor Red }
Read-Host "`nTecle Enter para fechar"
