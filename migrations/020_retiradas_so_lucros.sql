-- A aba de retiradas passa a receber só distribuição de lucros: os pró-labores que os clientes lançaram ali são retirados
-- (exclusão lógica: o registro fica no banco com removido_em e na auditoria, mas some das telas e das planilhas).
WITH r AS (
  UPDATE retiradas SET removido_em = now() WHERE tipo = 'pro_labore' AND removido_em IS NULL
  RETURNING id, empresa_id, competencia, socio_nome, valor
)
INSERT INTO auditoria(usuario_id, empresa_id, acao, entidade, entidade_id, detalhes)
SELECT NULL, empresa_id, 'retirada.remover_pro_labore', 'retirada', id::text,
       jsonb_build_object('competencia', competencia, 'socio', socio_nome, 'valor', valor, 'motivo', 'aba de retiradas só para distribuição de lucros')
  FROM r;
