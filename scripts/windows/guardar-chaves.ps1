# Mostra as duas chaves que precisam ficar guardadas FORA do notebook (sem elas, o backup não abre). Dê dois cliques em GUARDAR-CHAVES.bat.
$ErrorActionPreference = 'Stop'
$id = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $id.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { Start-Process powershell -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""; exit }
try {
  . "$PSScriptRoot\comum.ps1"; Carregar-Env
  if (-not $env:BACKUP_PASSPHRASE) { throw "Não achei BACKUP_PASSPHRASE em $App\.env.local" }
  $txt = @"
CHAVES DO PAINEL CONTVOO - guardar em local seguro, FORA do notebook e LONGE dos backups
Gerado em $(Get-Date -Format 'dd/MM/yyyy HH:mm') no computador $env:COMPUTERNAME

BACKUP_PASSPHRASE=$env:BACKUP_PASSPHRASE
APP_ENCRYPTION_KEY=$env:APP_ENCRYPTION_KEY

Para que servem:
- BACKUP_PASSPHRASE: abre os arquivos de backup (OneDrive/pen drive). Sem ela, o backup é inútil.
- APP_ENCRYPTION_KEY: mantém válido o 2FA dos usuários depois de restaurar em outro computador.

Onde guardar (escolha uma ou duas):
- gerenciador de senhas (Bitwarden, 1Password, cofre do navegador);
- impresso (Ctrl+P), em envelope no cofre/gaveta trancada do escritório.
NÃO salve este texto no OneDrive nem no pen drive do backup.

Para restaurar em outro computador: instale o painel (INSTALAR-PAINEL.bat), troque essas duas linhas
no C:\painel-contabil\.env.local pelos valores acima e siga docs\OPERACAO.md (seção 'Backup fora do notebook').
"@
  $f = Join-Path $env:TEMP ('chaves-painel-' + [guid]::NewGuid() + '.txt')
  [IO.File]::WriteAllText($f, $txt, (New-Object Text.UTF8Encoding($true)))
  Start-Process notepad.exe $f
  Write-Host 'Abri as chaves no Bloco de Notas. Imprima (Ctrl+P) ou copie para o gerenciador de senhas.' -ForegroundColor Yellow
  Read-Host 'Depois de guardar, FECHE o Bloco de Notas sem salvar e tecle Enter aqui (o arquivo temporário será apagado)'
  Remove-Item $f -Force -ErrorAction SilentlyContinue
  Write-Host 'Arquivo temporário apagado.' -ForegroundColor Green
} catch { Write-Host "`nERRO: $($_.Exception.Message)" -ForegroundColor Red }
Read-Host "`nTecle Enter para fechar"
