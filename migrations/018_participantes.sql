-- Clientes e fornecedores de cada empresa (cadastrados pelo próprio cliente ao conciliar, com o botão "+").
CREATE TABLE participantes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES empresas(id),
  tipo text NOT NULL CHECK (tipo IN ('cliente','fornecedor')),
  nome text NOT NULL CHECK (length(nome) BETWEEN 2 AND 120),
  documento text CHECK (documento IS NULL OR documento ~ '^(\d{11}|\d{14})$'),
  criado_por uuid NOT NULL REFERENCES usuarios(id),
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX participantes_nome ON participantes(empresa_id, tipo, lower(nome));
-- Cliente/fornecedor do lançamento; o histórico também lembra quem é (o mês seguinte já vem preenchido).
ALTER TABLE movimentacoes ADD COLUMN participante_id uuid REFERENCES participantes(id);
ALTER TABLE dicionario_classificacao ADD COLUMN participante_id uuid REFERENCES participantes(id);
