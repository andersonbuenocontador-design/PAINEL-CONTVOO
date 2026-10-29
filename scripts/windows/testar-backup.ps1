# Prova que o backup SERVE: faz um backup novo, abre a cópia de FORA do notebook (ou a local, se não houver), confere a cifra,
# lê o banco inteiro do dump e compara as contagens com o banco real, e compara cada documento com o original. Dê dois cliques em TESTAR-BACKUP.bat.
$ErrorActionPreference = 'Stop'
$id = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $id.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { Start-Process powershell -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""; exit }
$falhas = 0; $avisos = 0
function Ok($m) { Write-Host "  OK  $m" -ForegroundColor Green }
function Aviso($m) { Write-Host "  !!  $m" -ForegroundColor Yellow; $script:avisos++ }
function Falha($m) { Write-Host "  XX  $m" -ForegroundColor Red; $script:falhas++ }
function Hash-Stream($s) { $h = [Security.Cryptography.SHA256]::Create(); try { [BitConverter]::ToString($h.ComputeHash($s)) } finally { $s.Close() } }
try {
  . "$PSScriptRoot\comum.ps1"; Instalar-Scripts; Carregar-Env
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $dir = if ($env:BACKUP_DIR) { $env:BACKUP_DIR } else { "$App\backups" }
  $st = if ($env:STORAGE_DIR) { $env:STORAGE_DIR } else { "$App\storage" }
  $pg = Achar-Pg

  Write-Host "`n== 1/4 Fazendo um backup novo (para comparar com o banco de agora)" -ForegroundColor Cyan
  & "$App\scripts\windows\backup.ps1"
  $ts = @(Conjuntos-Locais $dir)[0]; if (-not $ts) { throw "nenhum backup encontrado em $dir" }
  $origem = $dir
  foreach ($d in Destinos-Externos) { if ((Test-Path "$d\painel-$ts.dump.enc") -and (Test-Path "$d\arquivos-$ts.zip.enc")) { $origem = $d; break } }
  if ($origem -eq $dir) { Aviso 'Não há cópia fora do notebook com este backup: testando a cópia LOCAL. Rode CONFIGURAR-BACKUP-EXTERNO.bat.' }
  Write-Host "  testando: $origem\*-$ts.*"

  $tmp = Join-Path $env:TEMP ('painel-teste-' + [guid]::NewGuid()); New-Item -ItemType Directory $tmp | Out-Null
  try {
    Write-Host "`n== 2/4 Cifra e senha" -ForegroundColor Cyan
    $cab = New-Object byte[] 5; $fs = [IO.File]::OpenRead("$origem\painel-$ts.dump.enc"); [void]$fs.Read($cab, 0, 5); $fs.Close()
    if ([Text.Encoding]::ASCII.GetString($cab) -eq 'PGDMP') { Falha 'o backup NÃO está cifrado' } else { Ok 'arquivo cifrado (ilegível sem a senha)' }
    Revelar-Arquivo "$origem\painel-$ts.dump.enc" "$tmp\b.dump" $env:BACKUP_PASSPHRASE
    Revelar-Arquivo "$origem\arquivos-$ts.zip.enc" "$tmp\a.zip" $env:BACKUP_PASSPHRASE
    Ok 'a senha do backup abre os arquivos'

    Write-Host "`n== 3/4 Banco de dados" -ForegroundColor Cyan
    & "$pg\pg_restore.exe" --file="$tmp\b.sql" "$tmp\b.dump"; if ($LASTEXITCODE) { throw 'pg_restore não conseguiu ler o dump (backup danificado)' }
    Ok 'dump lido por inteiro pelo pg_restore'
    $linhas = @{}; $tab = $null
    foreach ($l in [IO.File]::ReadLines("$tmp\b.sql")) {
      if ($tab) { if ($l -eq '\.') { $tab = $null } else { $linhas[$tab]++ } }
      elseif ($l -match '^COPY public\.(\w+) .*FROM stdin;$') { $tab = $Matches[1]; $linhas[$tab] = 0 }
    }
    foreach ($t in 'usuarios', 'empresas', 'arquivos', 'movimentacoes', 'informes', 'pendencias', 'auditoria') {
      $real = [int](& "$pg\psql.exe" -d $env:DATABASE_URL -tAc "SELECT count(*) FROM $t"); if ($LASTEXITCODE) { throw "não consegui contar $t no banco" }
      $bk = [int]$linhas[$t]
      if ($bk -eq $real) { Ok "${t}: $bk registro(s), igual ao banco" }
      elseif ($bk -lt $real -and $t -eq 'auditoria') { Ok "${t}: $bk no backup, $real agora (eventos novos depois do backup)" }
      elseif ($bk -lt $real) { Aviso "${t}: $bk no backup, $real agora (alguém mexeu durante o teste? rode de novo)" }
      else { Falha "${t}: backup tem $bk, banco tem $real" }
    }

    Write-Host "`n== 4/4 Documentos dos clientes" -ForegroundColor Cyan
    $zip = [IO.Compression.ZipFile]::OpenRead("$tmp\a.zip"); $n = 0; $dif = 0
    try {
      foreach ($e in $zip.Entries) {
        if (-not $e.Name) { continue }
        $orig = Join-Path $st ($e.FullName -replace '/', '\'); $n++
        if (-not (Test-Path $orig)) { $dif++; continue }
        if ((Hash-Stream ($e.Open())) -ne (Hash-Stream ([IO.File]::OpenRead($orig)))) { $dif++ }
      }
    } finally { $zip.Dispose() }
    $atual = @(Get-ChildItem $st -Recurse -File).Count
    if ($dif) { Falha "$dif de $n documento(s) do backup diferem do original" } else { Ok "$n documento(s) idênticos ao original" }
    if ($atual -gt $n) { Aviso "há $atual documento(s) hoje e $n no backup (envios durante o teste?)" }
  } finally { Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue }

  if ($falhas) { Registrar "TESTE DE BACKUP FALHOU ($falhas problema(s)) - $origem $ts"; Write-Host "`nO BACKUP TEM PROBLEMA. Não confie nele; me envie um print desta tela." -ForegroundColor Red }
  else { Registrar "Teste de backup OK - $origem $ts"; Write-Host "`nBACKUP APROVADO: dá para recuperar o painel a partir de $origem." -ForegroundColor Green
    if ($avisos) { Write-Host 'Leia os avisos em amarelo acima.' -ForegroundColor Yellow } }
} catch { Write-Host "`nERRO: $($_.Exception.Message)" -ForegroundColor Red; Write-Host "Veja $App\logs\backup.log" }
Read-Host "`nTecle Enter para fechar"
