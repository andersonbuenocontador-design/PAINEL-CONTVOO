# Colocar o painel na internet (sem notebook, sem custo)

O painel roda em três serviços gratuitos. Nenhum deles precisa de computador ligado no escritório:

| Serviço | O que faz | Plano |
|---|---|---|
| **GitHub** | guarda o código; todo dia confere o site (e mantém o Supabase ativo) e às 03:15 faz e **testa** o backup | grátis (repositório privado) |
| **Supabase** | banco de dados e documentos dos clientes (bucket **privado**) | grátis: 500 MB de banco, 1 GB de documentos |
| **Render** | o site em si (`https://…onrender.com`) | grátis: "dorme" após 15 min sem uso; o 1º acesso depois disso leva ~1 minuto |

Você cria as contas e cola as chaves nos lugares indicados. **Ninguém mais (nem o Claude) precisa saber as senhas.** Guarde tudo num gerenciador de senhas ou num papel em local seguro.

---

## Parte 1 — GitHub (onde fica o código)
1. Entre em **github.com** → *Sign up* (se ainda não tiver conta).
2. Clique em **+** (canto superior direito) → **New repository**:
   - Repository name: `painel-contvoo`
   - Marque **Private**
   - **Não** marque "Add a README" → **Create repository**.
3. Conecte o GitHub ao Claude: abra **https://claude.ai/connect-github**, autorize e instale o app do Claude no repositório `painel-contvoo`.
4. Avise o Claude no chat: ele envia o código para o repositório.

## Parte 2 — Supabase (banco e documentos)
1. **supabase.com** → *Start your project* → entre com o GitHub.
2. **New project**:
   - Name: `painel-contvoo`
   - Database Password: clique em **Generate a password** e **copie/guarde** (use só letras e números)
   - Region: **East US (North Virginia)** (mesma região do site: telas mais rápidas)
   - Plano **Free** → *Create new project* (leva ~2 minutos).
3. Copie três valores (guarde num bloco de notas por enquanto):
   - **DATABASE_URL**: botão **Connect** (no topo) → **Session pooler** → copie a URI (`postgresql://postgres.xxxx:[YOUR-PASSWORD]@aws-…pooler.supabase.com:5432/postgres`) e **troque `[YOUR-PASSWORD]`** pela senha do passo 2 (sem os colchetes).
   - **SUPABASE_URL**: **Project Settings → Data API** → *Project URL* (`https://xxxx.supabase.co`).
   - **SUPABASE_SECRET_KEY**: **Project Settings → API Keys** → *Secret keys* → copie a chave `sb_secret_…` (se só aparecer a aba *Legacy*, use a `service_role`).
   
   ⚠ A chave secreta abre todos os documentos: nunca a coloque em e-mail, WhatsApp ou site.
4. Não precisa criar tabelas nem pastas: o painel cria sozinho na primeira vez.

## Parte 3 — Render (o site)
1. **render.com** → *Get Started* → entre com o GitHub (autorize o acesso ao repositório `painel-contvoo`).
2. **New → Blueprint** → escolha `painel-contvoo` → o Render lê o arquivo `render.yaml` e pede estes valores:

   | Campo | O que colar |
   |---|---|
   | `DATABASE_URL` | do Supabase (com a senha no lugar de `[YOUR-PASSWORD]`) |
   | `SUPABASE_URL` | do Supabase |
   | `SUPABASE_SECRET_KEY` | do Supabase |
   | `APP_URL` | `https://painel-contvoo.onrender.com` (se o Render der outro endereço, corrija depois em *Environment*) |
   | `SEED_ADMIN_EMAIL` | `anderson.contabilrs@hotmail.com` |
   | `SEED_ADMIN_PASSWORD` | uma senha **provisória** que você inventa (10+ caracteres); será trocada no 1º acesso |

3. **Apply**. A primeira publicação leva uns 5–10 minutos. Quando aparecer **Live**, abra o endereço do site, entre com o e-mail e a senha provisória e **troque a senha**.
4. Depois do primeiro acesso: Render → serviço `painel-contvoo` → **Environment** → apague `SEED_ADMIN_PASSWORD` → *Save*.

## Parte 4 — Backup diário (GitHub)
No GitHub, repositório `painel-contvoo` → **Settings → Secrets and variables → Actions**:
1. Aba **Variables** → *New repository variable*: `APP_URL` = o endereço do site (ex.: `https://painel-contvoo.onrender.com`).
2. Aba **Secrets** → *New repository secret*, um por vez:

   | Nome | Valor |
   |---|---|
   | `DATABASE_URL` | o mesmo da Parte 2 |
   | `SUPABASE_URL` | o mesmo da Parte 2 |
   | `SUPABASE_SECRET_KEY` | o mesmo da Parte 2 |
   | `BACKUP_PASSPHRASE` | **invente** uma frase longa (16+ caracteres, ex.: 5 palavras aleatórias). **Anote no papel/gerenciador**: sem ela nenhum backup abre |

3. Aba **Actions** → *Backup diário* → **Run workflow**. Em ~3 minutos deve ficar **verde** ✔. Faça o mesmo em *Manter site ativo*.

A partir daí:
- Todo dia às 03:15 o GitHub faz o backup cifrado, **restaura num banco descartável e confere** as contagens. O arquivo fica 7 dias em *Actions → Backup diário → (execução) → Artifacts*. Baixe um de vez em quando e guarde fora (pen drive/OneDrive): é o seu seguro.
- Se o backup falhar, o GitHub manda e-mail para você.

## Sem e-mail
O escritório optou por **não usar e-mail**: o painel não envia avisos (pendências, prazos). Os clientes veem as solicitações ao entrar no painel. Se um dia quiser e-mail, o código continua pronto (`EMAIL_PROVIDER` + `BREVO_API_KEY` ou `SMTP_URL`, veja `.env.example`).

## Parte 5 — Aposentar o notebook
Quando o site na nuvem estiver funcionando:
1. No notebook, **Agendador de Tarefas** → desabilite *Painel Contvoo*, *Painel Lembretes* e *Painel Backup*.
2. Desligue o Tailscale Funnel (ícone do Tailscale → *Exit*/*Disconnect*).
3. O PostgreSQL do notebook pode ser desinstalado depois (Painel de Controle → Programas). Ainda não havia clientes reais nele.

---

## Esqueci a senha do administrador
Render → *Environment*: confira `SEED_ADMIN_EMAIL` (seu e-mail), coloque em `SEED_ADMIN_PASSWORD` uma senha provisória nova (10+ caracteres) e crie `REDEFINIR_SENHA_ADMIN` = `1` → *Save*. Em ~3 minutos entre com a senha provisória (o painel pede uma nova). Depois **apague** `REDEFINIR_SENHA_ADMIN` e `SEED_ADMIN_PASSWORD`. Se houver outro administrador, ele também pode redefinir em *Usuários*.

## Segurança adicional (recomendado, 2 minutos)
Supabase → **Project Settings → Database → SSL Configuration → Download certificate**. Abra o arquivo `.crt` no Bloco de Notas, copie tudo e cole em Render → *Environment* → nova variável `DATABASE_CA_CERT`. Assim o site confere que está falando com o banco verdadeiro (sem isso a conexão já é cifrada, mas não verificada).

## Restaurar um backup (desastre)
1. Baixe o artifact do backup (zip com `painel-*.dump.enc` e `arquivos-*.tar.gz.enc`).
2. Crie um projeto Supabase novo (Parte 2).
3. Num computador com Docker e Node (ou peça ao Claude numa sessão de nuvem):
   ```bash
   BACKUP_PASSPHRASE='…' DATABASE_URL='…novo…' SUPABASE_URL='…novo…' SUPABASE_SECRET_KEY='…novo…' \
     bash scripts/restaurar-nuvem.sh painel-*.dump.enc arquivos-*.tar.gz.enc
   ```
4. No Render e nos segredos do GitHub, troque `DATABASE_URL`, `SUPABASE_URL` e `SUPABASE_SECRET_KEY` pelos do projeto novo.
5. Guarde também o `APP_ENCRYPTION_KEY` do Render (Environment) junto da frase do backup: sem ele, quem usa 2FA precisa reconfigurar.

## Limites do plano grátis (para decidir quando pagar)
- **Render grátis dorme**: o primeiro acesso após 15 min parado leva ~1 minuto. Para ficar sempre rápido: plano *Starter* (US$ 7/mês), sem mudar nada no código.
- **Supabase grátis**: 500 MB de banco e 1 GB de documentos (mostrado em *Usage*). Projetos parados por 7 dias são pausados, mas a checagem diária do GitHub mantém o projeto ativo.
- **Backups**: 7 dias guardados no GitHub. Para guardar por mais tempo, baixe os arquivos periodicamente.
- Os dados ficam nos EUA (Virginia). Veja `docs/LGPD.md` (transferência internacional).
