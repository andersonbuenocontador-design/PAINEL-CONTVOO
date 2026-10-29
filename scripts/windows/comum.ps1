# Funções comuns (carregar com: . "$PSScriptRoot\comum.ps1")
$ErrorActionPreference = 'Stop'
$App = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (-not (Test-Path "$App\package.json")) { $App = 'C:\painel-contabil' }  # rodando de fora (ex.: Downloads\painel-instalar)
$MarcaPen = 'PAINEL-BACKUP-CONTVOO'  # pasta na raiz de um pen drive/HD externo que recebe as cópias
function Carregar-Env {
  if (-not (Test-Path "$App\.env.local")) { return }
  Get-Content "$App\.env.local" | ForEach-Object {
    if ($_ -match '^\s*([A-Z_]+)=(.*)$') { $val = $Matches[2].Trim()
      if ($val.Length -ge 2 -and $val.StartsWith('"') -and $val.EndsWith('"')) { $val = $val.Substring(1, $val.Length - 2) }
      Set-Item -Path "env:$($Matches[1])" -Value $val } }
}
function Gravar-Env($nome, $valor) {
  $f = "$App\.env.local"; $linhas = @(Get-Content $f | Where-Object { $_ -notmatch "^\s*$nome=" })
  if ($valor) { $linhas += "$nome=$valor" }
  [IO.File]::WriteAllLines($f, [string[]]$linhas, (New-Object Text.UTF8Encoding($false)))
}
function Instalar-Scripts {  # copia a versão nova dos scripts de backup para dentro do painel (a tarefa diária 'Painel Backup' roda os de lá)
  $alvo = "$App\scripts\windows"
  if (-not (Test-Path $alvo) -or (Resolve-Path $PSScriptRoot).Path -eq (Resolve-Path $alvo).Path) { return }
  foreach ($f in 'comum.ps1', 'backup.ps1', 'restaurar.ps1', 'testar-backup.ps1', 'guardar-chaves.ps1', 'backup-externo.ps1') {
    if (Test-Path "$PSScriptRoot\$f") { Copy-Item "$PSScriptRoot\$f" "$alvo\$f" -Force } }
  Write-Host "Scripts de backup atualizados em $alvo" -ForegroundColor DarkGray
}
function Registrar($msg) {
  New-Item -ItemType Directory -Force "$App\logs" | Out-Null
  Add-Content -Path "$App\logs\backup.log" -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $msg" -Encoding UTF8
  Write-Host $msg
}
function Achar-Pg { $d = Get-ChildItem "$env:ProgramFiles\PostgreSQL" -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
  if (-not $d) { throw 'PostgreSQL não encontrado.' }; return "$($d.FullName)\bin" }
function Proteger-Arquivo($entrada, $saida, $senha) {
  $salt = New-Object byte[] 16; $iv = New-Object byte[] 16
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create(); $rng.GetBytes($salt); $rng.GetBytes($iv)
  $kdf = New-Object Security.Cryptography.Rfc2898DeriveBytes($senha, $salt, 200000, [Security.Cryptography.HashAlgorithmName]::SHA256)
  $aes = [Security.Cryptography.Aes]::Create(); $aes.Key = $kdf.GetBytes(32); $aes.IV = $iv
  $out = [IO.File]::Create($saida); $out.Write($salt, 0, 16); $out.Write($iv, 0, 16)
  $cs = New-Object Security.Cryptography.CryptoStream($out, $aes.CreateEncryptor(), 'Write')
  $in = [IO.File]::OpenRead($entrada); $in.CopyTo($cs); $in.Close(); $cs.Close(); $out.Close()
}
function Revelar-Arquivo($entrada, $saida, $senha) {
  $in = [IO.File]::OpenRead($entrada); $salt = New-Object byte[] 16; $iv = New-Object byte[] 16
  [void]$in.Read($salt, 0, 16); [void]$in.Read($iv, 0, 16)
  $kdf = New-Object Security.Cryptography.Rfc2898DeriveBytes($senha, $salt, 200000, [Security.Cryptography.HashAlgorithmName]::SHA256)
  $aes = [Security.Cryptography.Aes]::Create(); $aes.Key = $kdf.GetBytes(32); $aes.IV = $iv
  $cs = New-Object Security.Cryptography.CryptoStream($in, $aes.CreateDecryptor(), 'Read')
  $out = [IO.File]::Create($saida)
  try { $cs.CopyTo($out); $cs.Close() } catch { throw 'Não consegui abrir o backup: a senha do backup (BACKUP_PASSPHRASE) não confere ou o arquivo está danificado.' }
  finally { $out.Close(); $in.Close() }
}

# --- Cópia fora do notebook (OneDrive e/ou pen drive) ---
# Destinos: pastas em BACKUP_COPIA_DIR (separadas por ;) + qualquer unidade (pen drive/HD externo) com a pasta $MarcaPen na raiz.
function Destinos-Externos {
  $l = @()
  if ($env:BACKUP_COPIA_DIR) { $l += @($env:BACKUP_COPIA_DIR -split ';' | ForEach-Object { $_.Trim() } | Where-Object { $_ }) }
  foreach ($d in [IO.DriveInfo]::GetDrives()) {
    try { if ($d.IsReady -and $d.Name -ne "$env:SystemDrive\") { $p = Join-Path $d.Name $MarcaPen; if (Test-Path $p) { $l += $p } } } catch { }
  }
  return $l
}
function Conjuntos-Locais($dir) {  # carimbos (yyyyMMdd-HHmmss) dos conjuntos completos, mais novo primeiro
  @(Get-ChildItem $dir -Filter 'painel-*.dump.enc' | ForEach-Object { $_.Name -replace '^painel-(.+)\.dump\.enc$', '$1' } |
    Where-Object { Test-Path (Join-Path $dir "arquivos-$_.zip.enc") } | Sort-Object -Descending)
}
function Copiar-Externo($dir) {
  $keep = if ($env:BACKUP_COPIA_KEEP) { [int]$env:BACKUP_COPIA_KEEP } else { 7 }
  $sets = @(Conjuntos-Locais $dir | Select-Object -First $keep)
  $destinos = @(Destinos-Externos); $okCount = 0
  if (-not $destinos.Count) { Registrar 'AVISO: nenhuma cópia fora do notebook configurada/conectada (rode CONFIGURAR-BACKUP-EXTERNO.bat).'; return 0 }
  if (-not $sets.Count) { Registrar 'AVISO: nenhum backup local para copiar.'; return 0 }
  foreach ($dest in $destinos) {
    try {
      if (-not (Test-Path $dest)) { New-Item -ItemType Directory -Force $dest | Out-Null }
      $copiados = 0
      foreach ($ts in $sets) {
        foreach ($nome in "painel-$ts.dump.enc", "arquivos-$ts.zip.enc") {
          $src = Join-Path $dir $nome; $dst = Join-Path $dest $nome
          if ((Test-Path $dst) -and (Get-Item $dst).Length -eq (Get-Item $src).Length) { continue }
          $livre = (New-Object IO.DriveInfo((Get-Item $dest).PSDrive.Root)).AvailableFreeSpace
          if ($livre -lt (Get-Item $src).Length + 50MB) { throw "sem espaço livre em $dest" }
          Copy-Item $src "$dst.parcial" -Force
          if ((Get-FileHash $src -Algorithm SHA256).Hash -ne (Get-FileHash "$dst.parcial" -Algorithm SHA256).Hash) { Remove-Item "$dst.parcial" -Force; throw "cópia de $nome saiu diferente do original" }
          Move-Item "$dst.parcial" $dst -Force; $copiados++
        }
      }
      foreach ($p in 'painel-*.dump.enc', 'arquivos-*.zip.enc') { Get-ChildItem $dest -Filter $p | Sort-Object Name -Descending | Select-Object -Skip $keep | Remove-Item -Force }
      Get-ChildItem $dest -Filter '*.parcial' | Remove-Item -Force -ErrorAction SilentlyContinue
      Registrar "Cópia externa OK em $dest ($copiados arquivo(s) novo(s); mais recente: $($sets[0]))"; $okCount++
    } catch { Registrar "ERRO na cópia externa para ${dest}: $($_.Exception.Message)" }
  }
  return $okCount
}
