-- Retiradas dos sócios: o CLIENTE informa, mês a mês, o que cada sócio retirou (pró-labore, lucros, outras).
CREATE TABLE retiradas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES empresas(id),
  competencia char(7) NOT NULL CHECK (competencia ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  data date NOT NULL,
  socio_nome text NOT NULL CHECK (length(trim(socio_nome)) BETWEEN 2 AND 120),
  tipo text NOT NULL CHECK (tipo IN ('pro_labore','lucros','outras')),
  valor numeric(14,2) NOT NULL CHECK (valor > 0),
  observacao text CHECK (observacao IS NULL OR length(observacao) <= 200),
  criado_por uuid NOT NULL REFERENCES usuarios(id),
  criado_em timestamptz NOT NULL DEFAULT now(),
  removido_em timestamptz,
  removido_por uuid REFERENCES usuarios(id),
  CHECK (to_char(data, 'YYYY-MM') = competencia)
);
CREATE INDEX retiradas_empresa_comp_idx ON retiradas (empresa_id, competencia) WHERE removido_em IS NULL;

-- Envio do mês ao escritório (ou "não houve retiradas"). Enquanto enviado, o cliente não altera; o escritório pode reabrir.
CREATE TABLE retiradas_envios (
  empresa_id uuid NOT NULL REFERENCES empresas(id),
  competencia char(7) NOT NULL CHECK (competencia ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  sem_retiradas boolean NOT NULL DEFAULT false,
  enviado_por uuid NOT NULL REFERENCES usuarios(id),
  enviado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa_id, competencia)
);
