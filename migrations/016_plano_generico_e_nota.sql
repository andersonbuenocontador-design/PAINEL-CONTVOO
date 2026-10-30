-- Plano genérico de categorias (grupo/descrição/tipo para o cliente escolher em linguagem simples) e nota fiscal por lançamento.
ALTER TABLE plano_contas
  ADD COLUMN grupo text,
  ADD COLUMN descricao text,
  ADD COLUMN tipo text CHECK (tipo IS NULL OR tipo IN ('C','D','T','CD')),
  ADD COLUMN generico boolean NOT NULL DEFAULT false;
-- Ao conciliar, o cliente informa o número da nota fiscal do lançamento ou marca "sem nota" (obrigatório para enviar ao escritório).
ALTER TABLE movimentacoes
  ADD COLUMN nota_fiscal text CHECK (nota_fiscal IS NULL OR length(nota_fiscal) <= 60),
  ADD COLUMN sem_nota boolean NOT NULL DEFAULT false;
