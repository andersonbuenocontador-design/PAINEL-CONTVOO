# Gera uma NOVA senha temporária para o administrador e mostra na tela. Dê dois cliques em NOVA-SENHA-ADMIN.bat.
$ErrorActionPreference = 'Stop'
$id = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $id.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { Start-Process powershell -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""; exit }
try {
  Copy-Item "$PSScriptRoot\redefinir-senha-admin.ts" 'C:\painel-contabil\scripts\redefinir-senha-admin.ts' -Force
  Set-Location 'C:\painel-contabil'
  $env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
  if (-not (Test-Path 'node_modules\tsx\dist\cli.mjs')) { throw 'Pasta node_modules incompleta (tsx ausente). Rode o INSTALAR-PAINEL.bat de novo.' }
  & node 'node_modules\tsx\dist\cli.mjs' 'scripts\redefinir-senha-admin.ts'; if ($LASTEXITCODE) { throw 'Não consegui redefinir a senha.' }
  Write-Host 'ANOTE A SENHA ACIMA ANTES DE FECHAR (ela não é gravada em lugar nenhum).' -ForegroundColor Yellow
} catch { Write-Host "`nERRO: $($_.Exception.Message)" -ForegroundColor Red }
Read-Host "`nTecle Enter para fechar"
