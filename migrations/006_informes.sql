-- Etapa 5: sócios e informes de lucros/retiradas, com versões, acesso por sócio e registro de downloads.
CREATE TABLE socios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES empresas(id),
  nome text NOT NULL CHECK (length(trim(nome)) > 1),
  cpf char(11) NOT NULL CHECK (cpf ~ '^[0-9]{11}$'),
  email text,
  restrito boolean NOT NULL DEFAULT true,   -- true: só os usuários autorizados para este sócio veem os informes dele
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, cpf),
  UNIQUE (id, empresa_id)
);
CREATE TABLE socio_usuarios (
  socio_id uuid NOT NULL REFERENCES socios(id) ON DELETE CASCADE,
  usuario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  criado_por uuid REFERENCES usuarios(id),
  criado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (socio_id, usuario_id)
);
CREATE TABLE informe_tipos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL CHECK (length(trim(nome)) > 1),
  ativo boolean NOT NULL DEFAULT true,
  ordem integer NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX informe_tipos_uq ON informe_tipos (lower(nome));
INSERT INTO informe_tipos(nome,ordem) VALUES ('Informe de rendimentos',1),('Demonstrativo de distribuição de lucros',2),('Demonstrativo de pró-labore',3),('Demonstrativo de outras retiradas',4),('Outros documentos',5);

CREATE TABLE informes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES empresas(id),
  socio_id uuid NOT NULL,
  tipo_id uuid NOT NULL REFERENCES informe_tipos(id),
  ano_calendario integer NOT NULL CHECK (ano_calendario BETWEEN 2000 AND 2100),
  periodo text,
  descricao text,
  situacao text NOT NULL DEFAULT 'rascunho' CHECK (situacao IN ('rascunho','disponivel','retirado')),
  disponibilizado_em timestamptz,
  criado_por uuid NOT NULL REFERENCES usuarios(id),
  criado_em timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (socio_id, empresa_id) REFERENCES socios(id, empresa_id)   -- o sócio TEM de ser da mesma empresa do informe
);
CREATE INDEX informes_empresa_idx ON informes (empresa_id, ano_calendario);
CREATE TABLE informe_versoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  informe_id uuid NOT NULL REFERENCES informes(id),
  versao integer NOT NULL CHECK (versao >= 1),
  nome_original text NOT NULL,
  chave_storage text NOT NULL UNIQUE,
  tamanho bigint NOT NULL,
  sha256 char(64) NOT NULL,
  enviado_por uuid NOT NULL REFERENCES usuarios(id),
  enviado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (informe_id, versao)
);
CREATE TABLE informe_acessos (
  id bigserial PRIMARY KEY,
  informe_id uuid NOT NULL REFERENCES informes(id),
  versao_id uuid NOT NULL REFERENCES informe_versoes(id),
  usuario_id uuid NOT NULL REFERENCES usuarios(id),
  acao text NOT NULL CHECK (acao IN ('baixar')),
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX informe_acessos_idx ON informe_acessos (informe_id, id DESC);
