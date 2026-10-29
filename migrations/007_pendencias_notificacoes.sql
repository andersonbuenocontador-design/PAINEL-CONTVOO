-- Etapa 6: pendências entre escritório e cliente + fila de notificações por e-mail (outbox).
ALTER TABLE usuarios ADD COLUMN receber_emails boolean NOT NULL DEFAULT true;

CREATE TABLE pendencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES empresas(id),
  competencia char(7) CHECK (competencia ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  categoria text NOT NULL CHECK (categoria IN ('documento','classificacao','informacao','outro')),
  descricao text NOT NULL CHECK (length(trim(descricao)) >= 3),
  prazo date,
  responsavel_id uuid REFERENCES usuarios(id),
  situacao text NOT NULL DEFAULT 'aberta' CHECK (situacao IN ('aberta','respondida','resolvida','cancelada')),
  criado_por uuid NOT NULL REFERENCES usuarios(id),
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  resolvida_em timestamptz,
  resolvida_por uuid REFERENCES usuarios(id)
);
CREATE INDEX pendencias_empresa_idx ON pendencias (empresa_id, situacao);
CREATE INDEX pendencias_prazo_idx ON pendencias (situacao, prazo);

CREATE TABLE pendencia_mensagens (
  id bigserial PRIMARY KEY,
  pendencia_id uuid NOT NULL REFERENCES pendencias(id),
  usuario_id uuid NOT NULL REFERENCES usuarios(id),
  texto text NOT NULL CHECK (length(trim(texto)) > 0),
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pendencia_msg_idx ON pendencia_mensagens (pendencia_id, id);

CREATE TABLE notificacoes (
  id bigserial PRIMARY KEY,
  destinatario_id uuid NOT NULL REFERENCES usuarios(id),
  empresa_id uuid REFERENCES empresas(id),
  pendencia_id uuid REFERENCES pendencias(id),
  tipo text NOT NULL,
  assunto text NOT NULL,
  corpo text NOT NULL,                    -- nunca contém documentos, valores ou dados bancários: só avisa e aponta para o painel
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','enviada','falha','cancelada')),
  tentativas integer NOT NULL DEFAULT 0,
  erro text,
  dedup text UNIQUE,
  criado_em timestamptz NOT NULL DEFAULT now(),
  enviada_em timestamptz
);
CREATE INDEX notificacoes_fila_idx ON notificacoes (status, id);
