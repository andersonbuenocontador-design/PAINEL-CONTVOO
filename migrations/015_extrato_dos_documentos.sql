-- Marca quando o arquivo anexado (documento do mês ou PDF avulso) já foi verificado como possível extrato bancário,
-- para a conciliação puxar os extratos dos documentos uma única vez.
ALTER TABLE arquivos ADD COLUMN extrato_verificado_em timestamptz;
ALTER TABLE documentos_avulsos ADD COLUMN extrato_verificado_em timestamptz;
