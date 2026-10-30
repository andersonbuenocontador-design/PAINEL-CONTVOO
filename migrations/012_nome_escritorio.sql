-- O 1º administrador criado pelo seed se chamava "Administrador": passa a aparecer como o escritório.
UPDATE usuarios SET nome='Contvoo Contabilidade', atualizado_em=now() WHERE papel='admin' AND nome='Administrador';
