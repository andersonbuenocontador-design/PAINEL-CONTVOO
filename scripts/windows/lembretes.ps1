# Chamado a cada hora pela tarefa agendada: gera lembretes de prazo e envia a fila de e-mails.
. "$PSScriptRoot\comum.ps1"; Carregar-Env
Invoke-RestMethod -Uri 'http://127.0.0.1:3100/api/notificacoes/processar' -Headers @{ Authorization = "Bearer $env:CRON_SECRET" } -TimeoutSec 60 | Out-Null
