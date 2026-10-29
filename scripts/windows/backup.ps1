# Backup cifrado (AES-256) do banco e dos arquivos. Roda todo dia pela tarefa agendada. Manual: powershell -File scripts\windows\backup.ps1
. "$PSScriptRoot\comum.ps1"; Carregar-Env
Add-Type -AssemblyName System.IO.Compression.FileSystem
$pg = Achar-Pg; $dir = if ($env:BACKUP_DIR) { $env:BACKUP_DIR } else { "$App\backups" }; New-Item -ItemType Directory -Force $dir | Out-Null
if (-not $env:BACKUP_PASSPHRASE) { throw 'Defina BACKUP_PASSPHRASE no .env.local' }
$ts = Get-Date -Format 'yyyyMMdd-HHmmss'; $tmp = Join-Path $env:TEMP "painel-bk-$ts"; New-Item -ItemType Directory $tmp | Out-Null
try {
  & "$pg\pg_dump.exe" --format=custom --no-owner --dbname=$env:DATABASE_URL --file="$tmp\painel.dump"; if ($LASTEXITCODE) { throw 'pg_dump falhou' }
  $st = if ($env:STORAGE_DIR) { $env:STORAGE_DIR } else { "$App\storage" }; New-Item -ItemType Directory -Force $st | Out-Null
  [IO.Compression.ZipFile]::CreateFromDirectory($st, "$tmp\arquivos.zip")
  Proteger-Arquivo "$tmp\painel.dump" "$dir\painel-$ts.dump.enc" $env:BACKUP_PASSPHRASE
  Proteger-Arquivo "$tmp\arquivos.zip" "$dir\arquivos-$ts.zip.enc" $env:BACKUP_PASSPHRASE
} finally { Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue }
$keep = if ($env:BACKUP_KEEP) { [int]$env:BACKUP_KEEP } else { 14 }
foreach ($p in 'painel-*.dump.enc', 'arquivos-*.zip.enc') { Get-ChildItem $dir -Filter $p | Sort-Object Name -Descending | Select-Object -Skip $keep | Remove-Item -Force }
Write-Host "Backup concluído em $dir ($ts)"
