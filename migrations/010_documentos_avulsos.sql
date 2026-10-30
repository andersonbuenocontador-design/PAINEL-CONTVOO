-- Outros documentos: PDFs que o cliente envia por conta própria (fora da lista de documentos exigidos).
CREATE TABLE documentos_avulsos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES empresas(id),
  competencia char(7) NOT NULL CHECK (competencia ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  descricao text CHECK (descricao IS NULL OR length(descricao) <= 200),
  nome_original text NOT NULL,
  chave_storage text NOT NULL UNIQUE,
  tamanho bigint NOT NULL,
  sha256 char(64) NOT NULL,
  enviado_por uuid NOT NULL REFERENCES usuarios(id),
  enviado_em timestamptz NOT NULL DEFAULT now(),
  visto_por uuid REFERENCES usuarios(id),   -- 1º download pelo escritório
  visto_em timestamptz,
  removido_em timestamptz,                  -- retirado (cliente antes de o escritório ver, ou o escritório)
  descartado_em timestamptz                 -- política de retenção (LGPD)
);
CREATE INDEX documentos_avulsos_empresa_comp_idx ON documentos_avulsos (empresa_id, competencia);
