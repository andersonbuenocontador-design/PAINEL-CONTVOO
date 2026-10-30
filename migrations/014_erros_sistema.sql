-- Erros inesperados do servidor (mensagem técnica mascarada, sem senhas), para diagnóstico sem acesso aos logs do Render.
CREATE TABLE erros_sistema (
  id bigserial PRIMARY KEY,
  criado_em timestamptz NOT NULL DEFAULT now(),
  onde text,
  mensagem text NOT NULL
);
CREATE INDEX erros_sistema_data_idx ON erros_sistema (criado_em DESC);
