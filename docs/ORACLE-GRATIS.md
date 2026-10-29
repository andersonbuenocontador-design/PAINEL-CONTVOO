# Publicar de graça: servidor Oracle (Always Free) + Cloudflare

Resultado: o painel em `https://painel.contvoocontabilidade.com.br`, sem contratar nada. O servidor **não abre portas para a internet**: o acesso público passa pelo Cloudflare Tunnel.

> Limites do "grátis": a Oracle pode recolher máquinas gratuitas ociosas e a disponibilidade da máquina gratuita varia. Mantenha **backups fora do servidor** (passo 7). Para uso com clientes de verdade, considere um servidor pago pequeno no futuro.

## 1. Conta Oracle Cloud (você)
1. Acesse oracle.com/cloud/free e crie a conta. Escolha a região **Brazil Southeast (Vinhedo)** ou **Brazil East (São Paulo)** (não dá para trocar depois).
2. O cartão serve só para verificar a identidade. Use apenas recursos marcados **Always Free**.

## 2. Criar a máquina (você)
- Menu → Compute → Instances → Create instance.
- Imagem: **Ubuntu 24.04**. Tipo (shape): **Ampere A1 (VM.Standard.A1.Flex)** com 2 OCPU e 12 GB de memória, disco de 50 GB. Se aparecer "Out of capacity", tente de novo em outro horário. (A máquina micro de 1 GB é pequena demais para compilar o painel.)
- Gere e **baixe a chave SSH privada** (arquivo `.key`). Guarde bem: sem ela não há acesso.
- Anote o **IP público**. Deixe só a porta 22 (SSH) liberada; não abra 80/443/3100.

## 3. Cloudflare (você)
1. O domínio `contvoocontabilidade.com.br` precisa estar na Cloudflare (plano gratuito), com os servidores de nome trocados no registro.br.
2. Zero Trust → Networks → **Tunnels** → Create a tunnel → Cloudflared → dê o nome `painel`. Copie o **token** (texto longo). A Cloudflare pode pedir um cartão para ativar o plano gratuito do Zero Trust, sem cobrança.
3. Na aba **Public Hostname**: hostname `painel.contvoocontabilidade.com.br`, serviço **HTTP** → `localhost:3100`.

## 4. Enviar o código (PowerShell no Windows)
```powershell
scp -i C:\caminho\chave.key C:\Users\contsul\Downloads\painel-contabil.zip ubuntu@IP_PUBLICO:~
ssh -i C:\caminho\chave.key ubuntu@IP_PUBLICO
```

## 5. Instalar (dentro do servidor, tudo em um comando)
```bash
mkdir -p ~/inst && unzip -o painel-contabil.zip scripts/instalar-servidor.sh -d ~/inst
sudo ADMIN_EMAIL=seu.email@contvoocontabilidade.com.br TUNNEL_TOKEN='COLE_O_TOKEN' bash ~/inst/scripts/instalar-servidor.sh ~/painel-contabil.zip
```
O script instala Node e PostgreSQL, cria banco e segredos, compila, sobe o serviço, agenda lembretes (a cada hora) e backup (todo dia 03:15) e liga o túnel. No fim mostra a **senha temporária** do administrador — anote; a troca é obrigatória no primeiro acesso.

## 6. Primeiro acesso e e-mail
1. Abra `https://painel.contvoocontabilidade.com.br`, entre com o e-mail e a senha temporária, troque a senha e **ative o 2FA** (guarde os códigos de recuperação).
2. Para os avisos por Outlook, edite `/opt/painel-contabil/.env.local` (`sudo nano`), descomente `EMAIL_PROVIDER` e `SMTP_URL` (veja a seção "E-mail pelo Outlook" do `IMPLANTACAO.md`) e rode `sudo systemctl restart painel`.
3. Confira o ambiente: `sudo -u painel bash -c 'cd /opt/painel-contabil && npm run verificar -- --producao'`.

## 7. Backups fora do servidor (obrigatório)
- Os backups cifrados ficam em `/opt/painel-contabil/backups`. Copie-os periodicamente para o seu computador/OneDrive: `scp -i chave.key "ubuntu@IP:/opt/painel-contabil/backups/*" .` (precisa liberar leitura: `sudo cp` para a pasta do usuário `ubuntu`).
- Guarde **fora do servidor** `BACKUP_PASSPHRASE` e `APP_ENCRYPTION_KEY` (estão no `.env.local`). Sem elas, backup e 2FA não abrem.
- Uma vez por mês: `npm run testar-backup` (veja `IMPLANTACAO.md` sobre `CREATEDB`/`TESTE_ADMIN_URL`).

## 8. Atualizar versão
Envie o novo zip e rode de novo o mesmo comando do passo 5 (sem `TUNNEL_TOKEN`). Ele faz backup antes, migra e recompila sem mexer em segredos nem arquivos enviados.

## IP real e segurança
Com o túnel, o painel só aceita conexões locais e lê o IP do cliente informado pela Cloudflare (`TRUST_PROXY=1` já vem ligado). Não abra a porta 3100 na rede da Oracle.
