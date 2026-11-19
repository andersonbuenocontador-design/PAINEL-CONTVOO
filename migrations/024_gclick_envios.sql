-- Envios da "Solicitação de documentos" do G-Click: um registro por tarefa e canal, para nunca mandar duas vezes.
-- canal 'gclick' = ✔ na atividade (o G-Click manda o e-mail sozinho); 'whatsapp' = mensagem padrão pelo Digisac.
CREATE TABLE gclick_envios (
  tarefa_id text NOT NULL,
  canal text NOT NULL CHECK (canal IN ('gclick','whatsapp')),
  competencia text NOT NULL,
  cliente_id bigint,
  status text NOT NULL CHECK (status IN ('enviando','ok','erro')),
  detalhe text,
  enviado_por uuid REFERENCES usuarios(id),
  enviado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tarefa_id, canal)
);
