# Backup cifrado (AES-256) do banco e dos arquivos + cópia fora do notebook (OneDrive/pen drive). Roda todo dia pela tarefa agendada. Manual: powershell -File scripts\windows\backup.ps1
. "$PSScriptRoot\comum.ps1"; Carregar-Env
Add-Type -AssemblyName System.IO.Compression.FileSystem
$dir = if ($env:BACKUP_DIR) { $env:BACKUP_DIR } else { "$App\backups" }; New-Item -ItemType Directory -Force $dir | Out-Null
$ts = Get-Date -Format 'yyyyMMdd-HHmmss'; $tmp = Join-Path $env:TEMP "painel-bk-$ts"
try {
  if (-not $env:BACKUP_PASSPHRASE) { throw 'Defina BACKUP_PASSPHRASE no .env.local' }
  if (-not $env:DATABASE_URL) { throw "DATABASE_URL não encontrada em $App\.env.local" }
  $pg = Achar-Pg; New-Item -ItemType Directory $tmp | Out-Null
  & "$pg\pg_dump.exe" --format=custom --no-owner --dbname=$env:DATABASE_URL --file="$tmp\painel.dump"; if ($LASTEXITCODE) { throw 'pg_dump falhou' }
  $st = if ($env:STORAGE_DIR) { $env:STORAGE_DIR } else { "$App\storage" }; New-Item -ItemType Directory -Force $st | Out-Null
  [IO.Compression.ZipFile]::CreateFromDirectory($st, "$tmp\arquivos.zip")
  Proteger-Arquivo "$tmp\arquivos.zip" "$dir\arquivos-$ts.zip.enc" $env:BACKUP_PASSPHRASE
  Proteger-Arquivo "$tmp\painel.dump" "$dir\painel-$ts.dump.enc" $env:BACKUP_PASSPHRASE
} catch {
  Remove-Item "$dir\*-$ts.*" -Force -ErrorAction SilentlyContinue
  Registrar "ERRO no backup local: $($_.Exception.Message)"; throw
} finally { Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue }
$keep = if ($env:BACKUP_KEEP) { [int]$env:BACKUP_KEEP } else { 14 }
foreach ($p in 'painel-*.dump.enc', 'arquivos-*.zip.enc') { Get-ChildItem $dir -Filter $p | Sort-Object Name -Descending | Select-Object -Skip $keep | Remove-Item -Force }
Registrar "Backup local OK em $dir ($ts)"
[void](Copiar-Externo $dir)
