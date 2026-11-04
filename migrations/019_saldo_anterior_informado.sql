-- Saldo anterior da conta no mês, informado pelo cliente ou escritório (quando o extrato não traz, ou para corrigir):
-- com ele o painel mostra quanto ficou no banco (saldo anterior + entradas - saídas).
CREATE TABLE saldos_informados (
  conta_id uuid NOT NULL REFERENCES contas_bancarias(id),
  competencia char(7) NOT NULL CHECK (competencia ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  empresa_id uuid NOT NULL REFERENCES empresas(id),
  saldo_anterior bigint NOT NULL,
  informado_por uuid NOT NULL REFERENCES usuarios(id),
  informado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conta_id, competencia)
);
