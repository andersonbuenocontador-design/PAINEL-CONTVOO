-- Etapa 4: envio da competência ao escritório, conferência, devolução por linha e conclusão.
ALTER TABLE conciliacoes DROP CONSTRAINT conciliacoes_status_check;
ALTER TABLE conciliacoes ADD CONSTRAINT conciliacoes_status_check CHECK (status IN ('revisao','enviada','devolvida','concluida'));
ALTER TABLE conciliacoes
  ADD COLUMN mensagem text,
  ADD COLUMN enviada_em timestamptz,
  ADD COLUMN enviada_por uuid REFERENCES usuarios(id),
  ADD COLUMN devolvida_em timestamptz,
  ADD COLUMN concluida_em timestamptz;
ALTER TABLE movimentacoes
  ADD COLUMN correcao_pedida boolean NOT NULL DEFAULT false,
  ADD COLUMN correcao_motivo text,
  ADD COLUMN correcao_por uuid REFERENCES usuarios(id),
  ADD COLUMN correcao_em timestamptz;
CREATE INDEX mov_correcao_idx ON movimentacoes (empresa_id, competencia) WHERE correcao_pedida;
