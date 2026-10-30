-- Pendência criada pelo botão "Cobrar envio" (Entregas do mês): identifica a cobrança de documentos de uma competência.
ALTER TABLE pendencias ADD COLUMN origem text CHECK (origem IS NULL OR origem IN ('cobranca_documentos'));
CREATE INDEX pendencias_cobranca_idx ON pendencias (empresa_id, competencia) WHERE origem = 'cobranca_documentos';
