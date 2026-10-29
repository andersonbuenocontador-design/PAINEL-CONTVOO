# Restaura um backup. Uso: powershell -File scripts\windows\restaurar.ps1 -Dump <painel-*.dump.enc> -Arquivos <arquivos-*.zip.enc> -DatabaseUrl <url do banco VAZIO> -PastaStorage <destino>
param([Parameter(Mandatory)][string]$Dump, [Parameter(Mandatory)][string]$Arquivos, [Parameter(Mandatory)][string]$DatabaseUrl, [Parameter(Mandatory)][string]$PastaStorage)
. "$PSScriptRoot\comum.ps1"; Carregar-Env
Add-Type -AssemblyName System.IO.Compression.FileSystem
$pg = Achar-Pg; $tmp = Join-Path $env:TEMP ('painel-rs-' + [guid]::NewGuid()); New-Item -ItemType Directory $tmp | Out-Null
try {
  Revelar-Arquivo $Dump "$tmp\b.dump" $env:BACKUP_PASSPHRASE; Revelar-Arquivo $Arquivos "$tmp\a.zip" $env:BACKUP_PASSPHRASE
  & "$pg\pg_restore.exe" --no-owner --exit-on-error --dbname=$DatabaseUrl "$tmp\b.dump"; if ($LASTEXITCODE) { throw 'pg_restore falhou' }
  New-Item -ItemType Directory -Force $PastaStorage | Out-Null; [IO.Compression.ZipFile]::ExtractToDirectory("$tmp\a.zip", $PastaStorage)
  Write-Host "Restauração concluída."
} finally { Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue }
