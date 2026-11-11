-- Retiradas: o cliente informa de onde saiu o dinheiro (conta bancária da empresa ou dinheiro em espécie),
-- para o escritório comparar com o extrato bancário que chega depois do fim do mês.
ALTER TABLE retiradas
  ADD COLUMN forma text CHECK (forma IS NULL OR forma IN ('banco','dinheiro')),   -- NULL = lançamento antigo, sem a informação
  ADD COLUMN conta_id uuid REFERENCES contas_bancarias(id),
  ADD CONSTRAINT retiradas_conta_so_banco CHECK (conta_id IS NULL OR forma = 'banco');

-- Lançamentos do extrato que o escritório marcou como "não é retirada de sócio" (param de aparecer como possível esquecimento).
CREATE TABLE retiradas_ignoradas (
  movimentacao_id bigint PRIMARY KEY REFERENCES movimentacoes(id) ON DELETE CASCADE,
  empresa_id uuid NOT NULL REFERENCES empresas(id),
  motivo text CHECK (motivo IS NULL OR length(motivo) <= 200),
  marcado_por uuid NOT NULL REFERENCES usuarios(id),
  marcado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX retiradas_ignoradas_empresa_idx ON retiradas_ignoradas (empresa_id);
