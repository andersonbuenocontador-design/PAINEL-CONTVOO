-- Configurações do escritório guardadas no banco (ex.: integração com o Digisac). Segredos ficam cifrados (AES-256-GCM, src/lib/cripto.ts).
CREATE TABLE configuracoes (
  chave text PRIMARY KEY,
  valor text NOT NULL,
  atualizado_por uuid REFERENCES usuarios(id),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
