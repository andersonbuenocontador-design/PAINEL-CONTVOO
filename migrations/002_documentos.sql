CREATE TABLE modelos_documento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL CHECK (length(trim(nome)) > 1),
  criado_por uuid REFERENCES usuarios(id),
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX modelos_nome_uq ON modelos_documento (lower(nome));

CREATE TABLE modelo_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modelo_id uuid NOT NULL REFERENCES modelos_documento(id) ON DELETE CASCADE,
  nome text NOT NULL,
  instituicao text,
  categoria text,
  formatos text[] NOT NULL,
  obrigatorio boolean NOT NULL DEFAULT true,
  frequencia text NOT NULL DEFAULT 'mensal' CHECK (frequencia IN ('mensal','trimestral','anual','eventual')),
  instrucoes text,
  dia_prazo integer CHECK (dia_prazo BETWEEN 1 AND 31)
);

CREATE TABLE exigencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES empresas(id),
  nome text NOT NULL CHECK (length(trim(nome)) > 1),
  instituicao text,
  categoria text,
  formatos text[] NOT NULL CHECK (array_length(formatos,1) >= 1),
  obrigatorio boolean NOT NULL DEFAULT true,
  frequencia text NOT NULL DEFAULT 'mensal' CHECK (frequencia IN ('mensal','trimestral','anual','eventual')),
  instrucoes text,
  dia_prazo integer CHECK (dia_prazo BETWEEN 1 AND 31),
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX exigencias_empresa_idx ON exigencias (empresa_id);
CREATE UNIQUE INDEX exigencias_unica_uq ON exigencias (empresa_id, lower(nome), lower(coalesce(instituicao,'')));

CREATE TABLE arquivos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES empresas(id),
  exigencia_id uuid NOT NULL REFERENCES exigencias(id),
  competencia char(7) NOT NULL CHECK (competencia ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  versao integer NOT NULL CHECK (versao >= 1),
  nome_original text NOT NULL,
  chave_storage text NOT NULL UNIQUE,
  tamanho bigint NOT NULL,
  sha256 char(64) NOT NULL,
  situacao text NOT NULL DEFAULT 'enviado' CHECK (situacao IN ('enviado','em_conferencia','aprovado','rejeitado','substituido')),
  motivo_rejeicao text,
  enviado_por uuid NOT NULL REFERENCES usuarios(id),
  enviado_em timestamptz NOT NULL DEFAULT now(),
  conferido_por uuid REFERENCES usuarios(id),
  conferido_em timestamptz,
  UNIQUE (exigencia_id, competencia, versao),
  CHECK (situacao <> 'rejeitado' OR length(trim(coalesce(motivo_rejeicao,''))) > 0)
);
CREATE INDEX arquivos_empresa_comp_idx ON arquivos (empresa_id, competencia);
