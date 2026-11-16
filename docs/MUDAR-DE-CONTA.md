# Mudar o painel para contas novas (GitHub, Supabase e Render) — SEM levar dados

Resultado: o mesmo sistema funcionando em contas novas, **vazio** (nenhuma empresa, cliente, documento ou extrato da conta antiga).
O painel monta sozinho, na primeira vez que liga: as tabelas do banco, a pasta privada de documentos, o plano genérico de categorias e o primeiro administrador.

Você cria as contas e cola as chaves nos lugares indicados. Ninguém mais (nem o Claude) precisa saber as senhas.
Tempo estimado: 40 minutos.

---

## Passo 1 — Levar o código para o GitHub novo
1. Entre na conta **nova** do GitHub.
2. Abra **https://github.com/new/import**.
   - *Your old repository's clone URL*: `https://github.com/andersonbuenocontador-design/PAINEL-CONTVOO`
   - *Repository name*: `painel-contvoo`
   - Marque **Private** → **Begin import** (leva 1–2 minutos).
   - Se o repositório antigo estiver privado, o GitHub pede usuário e senha/token da conta antiga.
   - Sem acesso à conta antiga: crie o repositório vazio (privado) e envie o arquivo `painel-contvoo-AAAA-MM-DD.zip` descompactado pelo botão *uploading an existing file*.
3. Para o Claude continuar trabalhando: abra **https://claude.ai/connect-github** com a conta nova e autorize o app do Claude no repositório `painel-contvoo`.

## Passo 2 — Supabase novo (banco e documentos)
Siga **`docs/NUVEM.md` → Parte 2**, na conta nova do Supabase. Guarde os três valores: `DATABASE_URL`, `SUPABASE_URL` e `SUPABASE_SECRET_KEY`.

## Passo 3 — Render novo (o site)
Siga **`docs/NUVEM.md` → Parte 3**, na conta nova do Render, escolhendo o repositório do GitHub **novo**.
- O nome `painel-contvoo.onrender.com` provavelmente já é da conta antiga: o Render vai dar outro endereço (ex.: `painel-contvoo-ab12.onrender.com`). Depois do primeiro *Live*, copie o endereço que aparece no topo do serviço e corrija `APP_URL` em **Environment** → *Save*.
- `SEED_ADMIN_EMAIL`: o e-mail do administrador da conta nova. `SEED_ADMIN_PASSWORD`: uma senha provisória (10+ caracteres), trocada no 1º acesso.
- Opcional, para a ligação com o n8n continuar: em **Environment**, crie `N8N_CONCILIACAO_URL` e `N8N_CONCILIACAO_TOKEN` com os mesmos valores do Render antigo (ou novos, se for usar outro n8n).
- `SESSION_SECRET` e `APP_ENCRYPTION_KEY` o Render gera sozinho. Não copie os da conta antiga.

## Passo 4 — Backup diário e "manter ativo" (GitHub novo)
Siga **`docs/NUVEM.md` → Parte 4** no repositório **novo**. A variável `APP_URL` tem que ser o endereço novo do Render (o do Passo 3).

## Passo 5 — Conferir
1. Abra `https://<endereço novo>/api/saude` → deve mostrar **ok**.
2. Entre com o e-mail e a senha provisória → troque a senha.
3. Cadastre uma empresa de teste, um usuário cliente e um documento pedido → entre como cliente e envie um PDF.
4. No GitHub novo: **Actions → Backup diário → Run workflow** → deve ficar verde.

## Passo 6 — n8n (se for continuar usando)
- Fluxo **"Painel Contvoo: cobrar extratos pelo Digisac"**: no nó **Configuração**, troque `painelUrl` pelo endereço novo e `painelToken` pelo mesmo valor de `N8N_CONCILIACAO_TOKEN` do Render novo.
- Fluxo **"Painel Contvoo: conciliacao concluida"**: continua igual se `N8N_CONCILIACAO_URL`/`N8N_CONCILIACAO_TOKEN` do Render novo forem os mesmos.

## Passo 7 — Desligar as contas antigas (só depois do Passo 5 dar certo)
Os dados antigos ficam **apenas** nas contas antigas. Antes de apagar, confirme que não precisa de mais nada delas.
1. **Render antigo**: serviço `painel-contvoo` → *Settings* → **Delete Web Service**.
2. **Supabase antigo**: *Project Settings* → **Delete project** (apaga banco e documentos para sempre).
3. **GitHub antigo**: repositório → *Settings* → **Delete this repository**. O repositório antigo está **público**: apague ou torne privado (*Change visibility*).
4. Desfaça o acesso do Claude à conta antiga em **https://github.com/settings/installations**.
