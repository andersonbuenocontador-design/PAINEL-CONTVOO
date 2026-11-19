-- Ligação da empresa do painel com o cliente do G-Click (id do G-Click), para importar cadastro e, no futuro, tarefas.
ALTER TABLE empresas ADD COLUMN gclick_id bigint UNIQUE;
