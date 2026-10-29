# Restaura um backup. Uso: powershell -File scripts\windows\restaurar.ps1 -Dump <painel-*.dump.enc> -Arquivos <arquivos-*.zip.enc> -DatabaseUrl <url do banco VAZIO> -PastaStorage <destino> [-Senha <BACKUP_PASSPHRASE>]
# Sem -Senha, usa a BACKUP_PASSPHRASE do .env.local. Em computador novo, informe a senha guardada (GUARDAR-CHAVES.bat).
param([Parameter(Mandatory)][string]$Dump, [Parameter(Mandatory)][string]$Arquivos, [Parameter(Mandatory)][string]$DatabaseUrl, [Parameter(Mandatory)][string]$PastaStorage, [string]$Senha)
. "$PSScriptRoot\comum.ps1"; Carregar-Env
if (-not $Senha) { $Senha = $env:BACKUP_PASSPHRASE }; if (-not $Senha) { throw 'Informe -Senha (BACKUP_PASSPHRASE guardada fora do notebook).' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
$pg = Achar-Pg; $tmp = Join-Path $env:TEMP ('painel-rs-' + [guid]::NewGuid()); New-Item -ItemType Directory $tmp | Out-Null
try {
  Revelar-Arquivo $Dump "$tmp\b.dump" $Senha; Revelar-Arquivo $Arquivos "$tmp\a.zip" $Senha
  & "$pg\pg_restore.exe" --no-owner --exit-on-error --dbname=$DatabaseUrl "$tmp\b.dump"; if ($LASTEXITCODE) { throw 'pg_restore falhou' }
  New-Item -ItemType Directory -Force $PastaStorage | Out-Null; [IO.Compression.ZipFile]::ExtractToDirectory("$tmp\a.zip", $PastaStorage)
  Write-Host "Restauração concluída."
} finally { Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue }
