-- WhatsApp de contato da empresa (cobrança de documentos pelo WhatsApp, por link wa.me: sem custo e sem API).
ALTER TABLE empresas ADD COLUMN whatsapp text CHECK (whatsapp IS NULL OR whatsapp ~ '^\d{10,13}$');
-- Comprovante por lançamento: o cliente anexa a nota, boleto ou recibo direto na movimentação (PDF ou imagem).
CREATE TABLE movimentacao_comprovantes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  movimentacao_id bigint NOT NULL REFERENCES movimentacoes(id) ON DELETE CASCADE,
  empresa_id uuid NOT NULL REFERENCES empresas(id),
  nome_original text NOT NULL,
  chave_storage text NOT NULL UNIQUE,
  tamanho bigint NOT NULL,
  sha256 char(64) NOT NULL,
  enviado_por uuid NOT NULL REFERENCES usuarios(id),
  enviado_em timestamptz NOT NULL DEFAULT now(),
  removido_em timestamptz
);
CREATE INDEX movimentacao_comprovantes_mov ON movimentacao_comprovantes(movimentacao_id) WHERE removido_em IS NULL;
