CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE usuarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL CHECK (length(trim(nome)) > 1),
  email text NOT NULL,
  senha_hash text NOT NULL,
  papel text NOT NULL CHECK (papel IN ('admin','cliente')),
  ativo boolean NOT NULL DEFAULT true,
  deve_trocar_senha boolean NOT NULL DEFAULT true,
  token_version integer NOT NULL DEFAULT 0,
  falhas_login integer NOT NULL DEFAULT 0,
  bloqueado_ate timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX usuarios_email_uq ON usuarios (lower(email));

CREATE TABLE empresas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  razao_social text NOT NULL CHECK (length(trim(razao_social)) > 1),
  nome_fantasia text,
  cnpj char(14) NOT NULL CHECK (cnpj ~ '^[0-9]{14}$'),
  email_contato text,
  responsavel_id uuid REFERENCES usuarios(id),
  situacao text NOT NULL DEFAULT 'ativa' CHECK (situacao IN ('ativa','inativa')),
  inicio_uso date,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX empresas_cnpj_uq ON empresas (cnpj);

CREATE TABLE usuario_empresas (
  usuario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  empresa_id uuid NOT NULL REFERENCES empresas(id),
  criado_por uuid REFERENCES usuarios(id),
  criado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, empresa_id)
);
CREATE INDEX usuario_empresas_empresa_idx ON usuario_empresas (empresa_id);

CREATE TABLE auditoria (
  id bigserial PRIMARY KEY,
  usuario_id uuid REFERENCES usuarios(id),
  empresa_id uuid REFERENCES empresas(id),
  acao text NOT NULL,
  entidade text,
  entidade_id text,
  detalhes jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auditoria_criado_idx ON auditoria (criado_em DESC);

-- Auditoria é somente-inserção: ninguém altera ou apaga registros.
CREATE FUNCTION auditoria_imutavel() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'A tabela de auditoria é imutável'; END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER auditoria_no_update BEFORE UPDATE OR DELETE ON auditoria
  FOR EACH ROW EXECUTE FUNCTION auditoria_imutavel();
CREATE TRIGGER auditoria_no_truncate BEFORE TRUNCATE ON auditoria
  FOR EACH STATEMENT EXECUTE FUNCTION auditoria_imutavel();

