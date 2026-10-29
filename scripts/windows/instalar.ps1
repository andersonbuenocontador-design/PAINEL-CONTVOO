# Instalador do Painel no Windows (notebook/PC do escritório). Dê dois cliques em INSTALAR-PAINEL.bat (na mesma pasta do painel-contabil.zip).
param([string]$Zip = (Join-Path $PSScriptRoot 'painel-contabil.zip'))
$ErrorActionPreference = 'Stop'
$id = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $id.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Start-Process powershell -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Zip `"$Zip`""; exit }
function Passo($t) { Write-Host "`n== $t" -ForegroundColor Cyan }
function Gerar($n) { -join ((1..$n) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) }) }
function Atualizar-Path { $env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User') }
try {
  if (-not (Test-Path $Zip)) { throw "Não achei o zip: $Zip" }
  $App = 'C:\painel-contabil'; $Dominio = 'painel.contvoocontabilidade.com.br'; $Porta = 3100
  $novo = -not (Test-Path "$App\.env.local")
  if ($novo) { $email = Read-Host 'E-mail do 1o administrador (ex.: voce@contvoocontabilidade.com.br)'; $token = Read-Host 'Token do Cloudflare Tunnel (cole e tecle Enter; deixe vazio para ligar depois)' }

  Passo '1/7 Baixando e instalando Node.js, PostgreSQL e cloudflared - pode demorar alguns minutos'
  $super = Gerar 20
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  $dl = 'C:\painel-instalar-temp'; New-Item -ItemType Directory -Force -Path $dl | Out-Null
  function Baixar($url, $arq, $minMB = 5) { Write-Host "   baixando $url"; for ($t = 1; $t -le 3; $t++) { Remove-Item $arq -Force -ErrorAction SilentlyContinue; & curl.exe -L --fail --silent --show-error --retry 3 -o $arq $url; if (-not $LASTEXITCODE -and (Test-Path $arq) -and ((Get-Item $arq).Length -ge ($minMB * 1MB))) { return }; Write-Host "   download incompleto, tentando de novo ($t/3)..." }; throw "Não consegui baixar $url (confira a internet/antivírus)." }
  function Msi($arq, $nome) { for ($t = 1; $t -le 6; $t++) { $r = Start-Process msiexec.exe -ArgumentList "/i `"$arq`" /qn /norestart /l*v `"$arq.log`"" -Wait -PassThru; if ($r.ExitCode -in 0, 3010) { return }; if ($r.ExitCode -eq 1618) { Write-Host '   outra instalação em andamento, aguardando 30s...'; Start-Sleep 30; continue }; throw "Instalação de $nome falhou (código $($r.ExitCode)). Log: $arq.log" }; throw "Instalação de $nome não concluiu (outra instalação ocupando o Windows). Reinicie o computador e rode de novo." }
  Atualizar-Path
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Baixar 'https://nodejs.org/dist/v22.12.0/node-v22.12.0-x64.msi' "$dl
ode.msi"
    Msi "$dl\node.msi" 'Node.js'
  }
  if (-not (Get-Service 'postgresql*' -ErrorAction SilentlyContinue)) {
    Baixar 'https://get.enterprisedb.com/postgresql/postgresql-16.4-1-windows-x64.exe' "$dl\pg.exe" 200
    Start-Process "$dl\pg.exe" -ArgumentList "--mode unattended --unattendedmodeui none --superpassword $super --serverport 5432" -Wait
    Write-Host "SENHA do administrador do PostgreSQL (anote): $super" -ForegroundColor Yellow
  }
  if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue) -and -not (Test-Path "$env:ProgramFiles\cloudflared")) {
    Baixar 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.msi' "$dl\cf.msi"
    Msi "$dl\cf.msi" 'cloudflared'
  }
  if (-not (Get-Service 'postgresql*' -ErrorAction SilentlyContinue)) { throw 'PostgreSQL não foi instalado. Veja as mensagens acima.' }
  Atualizar-Path
  if (-not (Get-Command node -ErrorAction SilentlyContinue) -and (Test-Path "$env:ProgramFiles\nodejs\node.exe")) { $env:Path += ";$env:ProgramFiles\nodejs" }
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js não ficou disponível. Reinicie o computador e rode de novo.' }

  Passo '2/7 Código'
  New-Item -ItemType Directory -Force $App | Out-Null
  $tmpx = Join-Path $env:TEMP ('painel-x-' + [guid]::NewGuid()); Expand-Archive -Path $Zip -DestinationPath $tmpx -Force
  foreach ($d in 'storage', 'backups') { Remove-Item "$tmpx\$d" -Recurse -Force -ErrorAction SilentlyContinue }
  Remove-Item "$tmpx\.env.local" -Force -ErrorAction SilentlyContinue
  if (-not $novo) { & "$App\scripts\windows\backup.ps1" }
  Copy-Item "$tmpx\*" $App -Recurse -Force; Remove-Item $tmpx -Recurse -Force

  Passo '3/7 Banco e configuração'
  $pgbin = (Get-ChildItem "$env:ProgramFiles\PostgreSQL" -Directory | Sort-Object Name -Descending | Select-Object -First 1).FullName + '\bin'
  if ($novo) {
    $pw = Gerar 32; $adm = Gerar 20
    $psql = "$pgbin\psql.exe"
    function Testar-Pg($senha) { $ErrorActionPreference = 'Continue'; $env:PGPASSWORD = $senha; & $psql -h 127.0.0.1 -U postgres -w -tAc 'select 1' 2>&1 | Out-Null; $ok = ($LASTEXITCODE -eq 0); $ErrorActionPreference = 'Stop'; return $ok }
    if (-not (Testar-Pg $super)) {
      if (-not $novo) { throw 'Não consigo entrar no PostgreSQL (senha). Esta já é uma instalação existente: informe a senha correta ou restaure por backup.' }
      Write-Host '   PostgreSQL ja existe com outra senha e ainda nao tem dados nossos: reinstalando limpo...' -ForegroundColor Yellow
      Get-Service 'postgresql*' -ErrorAction SilentlyContinue | Stop-Service -Force -ErrorAction SilentlyContinue
      $un = Get-ChildItem "$env:ProgramFiles\PostgreSQL\*\uninstall-postgresql.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
      if ($un) { Start-Process $un.FullName -ArgumentList '--mode unattended --unattendedmodeui none' -Wait }
      Start-Sleep 3; Remove-Item "$env:ProgramFiles\PostgreSQL" -Recurse -Force -ErrorAction SilentlyContinue
      if (-not (Test-Path "$dl\pg.exe")) { Baixar 'https://get.enterprisedb.com/postgresql/postgresql-16.4-1-windows-x64.exe' "$dl\pg.exe" 200 }
      Start-Process "$dl\pg.exe" -ArgumentList "--mode unattended --unattendedmodeui none --superpassword $super --serverport 5432" -Wait
      Start-Sleep 12
      $pgbin = (Get-ChildItem "$env:ProgramFiles\PostgreSQL" -Directory | Sort-Object Name -Descending | Select-Object -First 1).FullName + '\bin'; $psql = "$pgbin\psql.exe"
      if (-not (Testar-Pg $super)) { throw 'PostgreSQL reinstalado, mas ainda não consigo entrar. Reinicie o computador e rode de novo.' }
      Write-Host "SENHA do administrador do PostgreSQL (anote): $super" -ForegroundColor Yellow
    }
    $env:PGPASSWORD = $super
    & "$pgbin\psql.exe" -h 127.0.0.1 -U postgres -v ON_ERROR_STOP=1 -c "CREATE ROLE painel LOGIN PASSWORD '$pw'" -c "CREATE DATABASE painel OWNER painel"
    if ($LASTEXITCODE) { throw 'Não consegui criar o banco (senha do PostgreSQL?).' }
    $b64 = { [Convert]::ToBase64String([byte[]](1..48 | ForEach-Object { Get-Random -Maximum 256 })) }
    $envTxt = @"
DATABASE_URL=postgres://painel:$pw@127.0.0.1:5432/painel
SESSION_SECRET=$(& $b64)
APP_ENCRYPTION_KEY=$(& $b64)
SEED_ADMIN_EMAIL=$email
SEED_ADMIN_PASSWORD=$adm
APP_URL=https://$Dominio
EMAIL_FROM="Contvoo Contabilidade <avisos@contvoocontabilidade.com.br>"
#EMAIL_PROVIDER=smtp
#SMTP_URL=smtp://usuario%40contvoocontabilidade.com.br:SENHA@smtp.office365.com:587
CRON_SECRET=$(Gerar 48)
EXIGIR_2FA_ADMIN=1
TRUST_PROXY=1
STORAGE_DIR=$App\storage
RETENCAO_ANOS=5
BACKUP_PASSPHRASE=$(Gerar 48)
BACKUP_DIR=$App\backups
BACKUP_KEEP=14
"@
    [IO.File]::WriteAllText("$App\.env.local", $envTxt, (New-Object Text.UTF8Encoding($false)))
    icacls "$App\.env.local" /inheritance:r /grant:r "SYSTEM:F" "Administrators:F" | Out-Null
  }
  New-Item -ItemType Directory -Force "$App\storage", "$App\backups", "$App\logs" | Out-Null

  Passo '4/7 Instalar, migrar e compilar (vários minutos)'
  Push-Location $App
  npm ci --no-audit --no-fund; if ($LASTEXITCODE) { throw 'npm ci falhou' }
  npm run migrate; if ($LASTEXITCODE) { throw 'migrate falhou' }
  if ($novo) { npm run seed; if ($LASTEXITCODE) { throw 'seed falhou' }
    $linhas = Get-Content .env.local | Where-Object { $_ -notmatch '^SEED_ADMIN_PASSWORD=' }; [IO.File]::WriteAllLines("$App\.env.local", $linhas, (New-Object Text.UTF8Encoding($false))) }
  npx next build --webpack; if ($LASTEXITCODE) { throw 'build falhou' }
  npm run verificar -- --producao
  Pop-Location

  Passo '5/7 Painel como serviço (liga junto com o Windows)'
  $node = (Get-Command node).Source
  $acao = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c cd /d $App && `"$node`" node_modules\next\dist\bin\next start -H 127.0.0.1 -p $Porta >> logs\app.log 2>&1"
  $cfg = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
  Register-ScheduledTask -TaskName 'Painel Contvoo' -Action $acao -Trigger (New-ScheduledTaskTrigger -AtStartup) -Settings $cfg -User 'SYSTEM' -RunLevel Highest -Force | Out-Null
  Stop-ScheduledTask -TaskName 'Painel Contvoo' -ErrorAction SilentlyContinue; Start-ScheduledTask -TaskName 'Painel Contvoo'

  Passo '6/7 Lembretes por hora, backup diario e energia'
  $ps = 'powershell.exe'
  $a1 = New-ScheduledTaskAction -Execute $ps -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$App\scripts\windows\lembretes.ps1`""
  $t1 = New-ScheduledTaskTrigger -Once -At (Get-Date).Date -RepetitionInterval (New-TimeSpan -Hours 1)
  Register-ScheduledTask -TaskName 'Painel Lembretes' -Action $a1 -Trigger $t1 -User 'SYSTEM' -RunLevel Highest -Force | Out-Null
  $a2 = New-ScheduledTaskAction -Execute $ps -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$App\scripts\windows\backup.ps1`""
  Register-ScheduledTask -TaskName 'Painel Backup' -Action $a2 -Trigger (New-ScheduledTaskTrigger -Daily -At 3:15am) -User 'SYSTEM' -RunLevel Highest -Force | Out-Null
  powercfg /change standby-timeout-ac 0; powercfg /change hibernate-timeout-ac 0
  powercfg /setacvalueindex SCHEME_CURRENT SUB_BUTTONS LIDACTION 0; powercfg /setactive SCHEME_CURRENT

  Passo '7/7 Cloudflare Tunnel'
  if ($novo -and $token) { cloudflared service install $token } else { Write-Host 'Túnel não ligado agora. Com o token: cloudflared service install <TOKEN>' }

  Start-Sleep 8; Passo 'Verificação'
  try { Invoke-RestMethod "http://127.0.0.1:$Porta/api/saude" | ConvertTo-Json -Compress } catch { Write-Host "Saúde falhou: $($_.Exception.Message). Veja $App\logs\app.log" -ForegroundColor Red }
  if ($novo) { Write-Host "`nADMINISTRADOR: $email  SENHA TEMPORARIA: $adm  (troca obrigatória no 1o acesso)" -ForegroundColor Yellow }
  Write-Host "Pronto. Acesso público: https://$Dominio  (local: http://127.0.0.1:$Porta)" -ForegroundColor Green
} catch { Write-Host "`nERRO: $($_.Exception.Message)" -ForegroundColor Red; Write-Host $_.InvocationInfo.PositionMessage -ForegroundColor DarkRed }
Read-Host "`nTecle Enter para fechar"
