-- Classificação passa a usar o PLANO DE CONTAS de cada cliente (editado pelo escritório), como no Conciliador Contvoo.
DROP INDEX IF EXISTS mov_hist_idx;
ALTER TABLE movimentacoes DROP COLUMN categoria_id, DROP COLUMN pessoa, DROP COLUMN cpf_cnpj;
ALTER TABLE movimentacoes RENAME COLUMN descricao_complementar TO complemento;
ALTER TABLE movimentacoes
  ADD COLUMN conta_codigo integer,
  ADD COLUMN confianca char(1) NOT NULL DEFAULT 'B' CHECK (confianca IN ('A','M','B')),
  ADD COLUMN motivo text,
  ADD COLUMN origem text NOT NULL DEFAULT 'regra' CHECK (origem IN ('regra','historico','manual')),
  ADD COLUMN revisado boolean NOT NULL DEFAULT false,
  ADD COLUMN revisado_por uuid REFERENCES usuarios(id),
  ADD COLUMN revisado_em timestamptz;
CREATE INDEX mov_conf_idx ON movimentacoes (empresa_id, competencia, confianca);
DROP TABLE categorias;

CREATE TABLE plano_contas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES empresas(id),
  codigo integer NOT NULL CHECK (codigo > 0),                         -- código reduzido (Domínio)
  classificacao text NOT NULL CHECK (classificacao ~ '^\d(\.\d{1,5}){0,6}$'),  -- ex.: 3.1.2.01.0004
  nome text NOT NULL CHECK (length(trim(nome)) > 1),
  ativo boolean NOT NULL DEFAULT true,
  UNIQUE (empresa_id, codigo)
);

-- "OK" ensina o sistema: descrição normalizada + sentido (C/D) -> conta, por cliente.
CREATE TABLE dicionario_classificacao (
  empresa_id uuid NOT NULL REFERENCES empresas(id),
  chave text NOT NULL,
  sentido char(1) NOT NULL CHECK (sentido IN ('C','D')),
  conta_codigo integer NOT NULL,
  vezes integer NOT NULL DEFAULT 1,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa_id, chave, sentido)
);

CREATE TABLE conciliacoes (
  empresa_id uuid NOT NULL REFERENCES empresas(id),
  competencia char(7) NOT NULL CHECK (competencia ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  status text NOT NULL DEFAULT 'revisao' CHECK (status IN ('revisao','concluida')),
  atualizado_por uuid REFERENCES usuarios(id),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa_id, competencia)
);
