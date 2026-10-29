CREATE TABLE contas_bancarias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES empresas(id),
  banco text NOT NULL CHECK (length(trim(banco)) > 0),
  apelido text,
  agencia text,
  conta text,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX contas_empresa_idx ON contas_bancarias (empresa_id);
CREATE UNIQUE INDEX contas_unica_uq ON contas_bancarias (empresa_id, lower(banco), coalesce(agencia,''), coalesce(conta,''));

CREATE TABLE categorias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL CHECK (length(trim(nome)) > 1),
  tipo text NOT NULL CHECK (tipo IN ('entrada','saida')),
  sensivel boolean NOT NULL DEFAULT false,
  ativo boolean NOT NULL DEFAULT true,
  ordem integer NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX categorias_uq ON categorias (tipo, lower(nome));

INSERT INTO categorias(nome,tipo,sensivel,ordem) VALUES
 ('Recebimento de clientes','entrada',false,1),('Empréstimos recebidos','entrada',true,2),('Integralização de capital','entrada',true,3),
 ('Transferências entre contas próprias','entrada',true,4),('Resgate de aplicações','entrada',true,5),('Aportes de sócios','entrada',true,6),
 ('Devoluções de pagamentos','entrada',false,7),('Outros recebimentos','entrada',false,8),
 ('Fornecedores','saida',false,1),('Despesas operacionais','saida',false,2),('Folha de pagamento','saida',false,3),('Impostos','saida',false,4),
 ('Empréstimos e financiamentos','saida',true,5),('Transferências entre contas próprias','saida',true,6),('Aplicações financeiras','saida',true,7),
 ('Retiradas de sócios','saida',true,8),('Distribuição de lucros','saida',true,9),('Adiantamentos a sócios','saida',true,10),('Outros pagamentos','saida',false,11);

CREATE TABLE importacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES empresas(id),
  conta_id uuid NOT NULL REFERENCES contas_bancarias(id),
  competencia char(7) NOT NULL CHECK (competencia ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  nome_arquivo text NOT NULL,
  formato text NOT NULL,
  sha256 char(64) NOT NULL,
  status text NOT NULL DEFAULT 'previa' CHECK (status IN ('previa','confirmada','cancelada')),
  dados jsonb NOT NULL,           -- linhas da prévia (descartadas ao confirmar/cancelar)
  resumo jsonb NOT NULL,
  criado_por uuid NOT NULL REFERENCES usuarios(id),
  criado_em timestamptz NOT NULL DEFAULT now(),
  confirmada_em timestamptz
);
CREATE INDEX importacoes_empresa_idx ON importacoes (empresa_id, competencia);

CREATE TABLE movimentacoes (
  id bigserial PRIMARY KEY,
  empresa_id uuid NOT NULL REFERENCES empresas(id),
  conta_id uuid NOT NULL REFERENCES contas_bancarias(id),
  importacao_id uuid NOT NULL REFERENCES importacoes(id),
  competencia char(7) NOT NULL,
  data date NOT NULL,
  descricao_original text NOT NULL,       -- nunca alterada
  valor_centavos bigint NOT NULL CHECK (valor_centavos <> 0),   -- entrada > 0, saída < 0
  saldo_centavos bigint,
  id_externo text,
  documento text,
  chave_normalizada text NOT NULL,        -- para sugestões por histórico
  categoria_id uuid REFERENCES categorias(id),
  pessoa text,
  cpf_cnpj text,
  descricao_complementar text,
  observacao text,
  classificado_por uuid REFERENCES usuarios(id),
  classificado_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mov_empresa_comp_idx ON movimentacoes (empresa_id, competencia, data, id);
CREATE INDEX mov_conta_data_idx ON movimentacoes (conta_id, data, valor_centavos);
CREATE UNIQUE INDEX mov_id_externo_uq ON movimentacoes (conta_id, id_externo) WHERE id_externo IS NOT NULL;
CREATE INDEX mov_hist_idx ON movimentacoes (empresa_id, chave_normalizada) WHERE categoria_id IS NOT NULL;
