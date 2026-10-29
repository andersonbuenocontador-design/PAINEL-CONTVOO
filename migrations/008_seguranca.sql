-- Etapa 7: limite de tentativas por IP e verificação em duas etapas (TOTP) com códigos de recuperação.
CREATE TABLE login_falhas_ip (
  ip_hash text NOT NULL,
  janela timestamptz NOT NULL,
  falhas integer NOT NULL DEFAULT 0,
  PRIMARY KEY (ip_hash, janela)
);
ALTER TABLE usuarios
  ADD COLUMN mfa_segredo text,                         -- segredo TOTP CIFRADO (AES-256-GCM); nunca em texto puro
  ADD COLUMN mfa_ativo boolean NOT NULL DEFAULT false,
  ADD COLUMN mfa_ativado_em timestamptz,
  ADD COLUMN mfa_ultimo_passo bigint;                  -- impede reutilizar o mesmo código (replay)
CREATE TABLE mfa_recuperacao (
  id bigserial PRIMARY KEY,
  usuario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  codigo_hash text NOT NULL,
  usado_em timestamptz
);
CREATE INDEX mfa_recuperacao_idx ON mfa_recuperacao (usuario_id) WHERE usado_em IS NULL;
