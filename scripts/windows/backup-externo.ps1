# Configura a cópia do backup FORA do notebook (OneDrive e/ou pen drive/HD externo), faz um backup na hora e confere. Dê dois cliques em CONFIGURAR-BACKUP-EXTERNO.bat.
param([string]$OneDrive = $env:OneDrive, [string]$OneDriveEmpresa = $env:OneDriveCommercial)
$ErrorActionPreference = 'Stop'
$id = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $id.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Start-Process powershell -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -OneDrive `"$OneDrive`" -OneDriveEmpresa `"$OneDriveEmpresa`""; exit }
try {
  . "$PSScriptRoot\comum.ps1"
  if (-not (Test-Path "$App\.env.local")) { throw "Não achei o painel instalado em $App." }
  Instalar-Scripts; $alvo = "$App\scripts\windows"
  Carregar-Env

  Write-Host "`n== Backup fora do notebook" -ForegroundColor Cyan
  Write-Host 'O backup diário (03:15) fica em C:\painel-contabil\backups. Se o notebook quebrar ou for roubado, ele se perde junto.'
  Write-Host 'Escolha para onde mandar uma CÓPIA (os arquivos vão cifrados: sem a senha do backup ninguém consegue abrir).'
  $op = @()
  foreach ($od in @(@{ n = 'OneDrive'; p = $OneDrive }, @{ n = 'OneDrive da empresa'; p = $OneDriveEmpresa })) {
    if ($od.p -and (Test-Path $od.p) -and -not ($op | Where-Object { $_.p -eq $od.p })) { $op += @{ t = "$($od.n) ($($od.p))"; p = (Join-Path $od.p 'Backup Painel Contvoo'); pen = $false } } }
  foreach ($d in [IO.DriveInfo]::GetDrives()) {
    try { if (-not $d.IsReady -or $d.Name -eq "$env:SystemDrive\") { continue }
      $usb = $d.DriveType -eq 'Removable'  # HD externo aparece como 'Fixed': aceita só se estiver ligado por USB (partição D: do próprio notebook não serve)
      if (-not $usb -and $d.DriveType -eq 'Fixed') { $usb = (Get-Partition -DriveLetter $d.Name[0] -ErrorAction SilentlyContinue | Get-Disk -ErrorAction SilentlyContinue).BusType -eq 'USB' }
      if ($usb) {
      $op += @{ t = "Pen drive/HD $($d.Name) $($d.VolumeLabel) - livre: $([math]::Round($d.AvailableFreeSpace / 1GB, 1)) GB"; p = (Join-Path $d.Name $MarcaPen); pen = $true } } } catch { }
  }
  if (-not $op.Count) { throw 'Não achei OneDrive neste usuário nem pen drive conectado. Conecte um pen drive (ou entre no OneDrive) e rode de novo.' }
  for ($i = 0; $i -lt $op.Count; $i++) { Write-Host ("  [{0}] {1}" -f ($i + 1), $op[$i].t) }
  if ($env:BACKUP_COPIA_DIR) { Write-Host "  (hoje configurado: $env:BACKUP_COPIA_DIR)" -ForegroundColor DarkGray }
  $resp = Read-Host "`nDigite o(s) número(s) separados por vírgula (ex.: 1,2) e tecle Enter"
  $esc = @($resp -split '[,; ]+' | Where-Object { $_ -match '^\d+$' } | ForEach-Object { [int]$_ - 1 } | Where-Object { $_ -ge 0 -and $_ -lt $op.Count } | Select-Object -Unique)
  if (-not $esc.Count) { throw 'Nenhuma opção válida escolhida. Nada foi alterado.' }

  $pastas = @()
  foreach ($i in $esc) {
    $o = $op[$i]; New-Item -ItemType Directory -Force $o.p | Out-Null
    [IO.File]::WriteAllText((Join-Path $o.p 'LEIA-ME.txt'), "Cópias cifradas do backup do Painel Contvoo (banco + documentos dos clientes).`r`nPara restaurar é preciso a senha do backup (BACKUP_PASSPHRASE), guardada FORA daqui.`r`nVeja docs\OPERACAO.md do painel, seção 'Backup fora do notebook'.`r`n", (New-Object Text.UTF8Encoding($false)))
    if (-not $o.pen) { $pastas += $o.p }  # pen drives são achados pela pasta $MarcaPen, em qualquer letra de unidade
    Write-Host "  destino: $($o.p)" -ForegroundColor Green
  }
  Gravar-Env 'BACKUP_COPIA_DIR' ($pastas -join ';'); $env:BACKUP_COPIA_DIR = $pastas -join ';'  # a escolha de agora substitui a anterior

  Write-Host "`n== Fazendo um backup agora e copiando (pode levar alguns minutos)" -ForegroundColor Cyan
  & "$alvo\backup.ps1"
  $dest = @(Destinos-Externos)
  Write-Host "`n== Conferência" -ForegroundColor Cyan
  foreach ($d in $dest) {
    $ult = Get-ChildItem $d -Filter 'painel-*.dump.enc' -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
    if ($ult) { Write-Host "  OK  $d -> $($ult.Name)" -ForegroundColor Green } else { Write-Host "  FALHOU  $d (veja $App\logs\backup.log)" -ForegroundColor Red }
  }
  Write-Host "`nPronto. Todo dia às 03:15 o backup é feito e copiado automaticamente para esses destinos." -ForegroundColor Green
  if ($pastas.Count) { Write-Host 'OneDrive: confira se o ícone de nuvem perto do relógio está sem erro (ele é quem sobe os arquivos para a internet).' }
  if ($esc | Where-Object { $op[$_].pen }) { Write-Host 'Pen drive: deixe conectado, ou conecte de vez em quando. Ao conectar, a próxima rotina diária atualiza a cópia. Guarde-o longe do notebook.' }
  Write-Host "`nPRÓXIMOS PASSOS (uma vez só):" -ForegroundColor Yellow
  Write-Host '  1. GUARDAR-CHAVES.bat  -> anote/imprima a senha do backup. Sem ela as cópias não servem para nada.'
  Write-Host '  2. TESTAR-BACKUP.bat   -> prova que a cópia abre e está completa (repita uma vez por mês).'
} catch { Write-Host "`nERRO: $($_.Exception.Message)" -ForegroundColor Red }
Read-Host "`nTecle Enter para fechar"
