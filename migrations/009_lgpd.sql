-- Etapa 7 (LGPD): descarte do CONTEÚDO de arquivos vencidos (os metadados e a auditoria permanecem).
ALTER TABLE arquivos ADD COLUMN descartado_em timestamptz;
ALTER TABLE informe_versoes ADD COLUMN descartado_em timestamptz;
