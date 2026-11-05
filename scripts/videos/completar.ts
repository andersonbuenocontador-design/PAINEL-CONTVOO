// Entre a cena do Contvoo AI e a da tabela: deixa todos os lançamentos prontos, menos 3 (para a cena da tabela mostrar o acabamento).
process.loadEnvFile('.env.local');
const { query } = await import('../../src/lib/db');
const K = await import('../../src/lib/services/conciliacao');
const { sugerirParticipante } = await import('../../src/lib/complemento');
const ids = JSON.parse((await import('node:fs')).readFileSync(`${process.env.DADOS_VIDEOS ?? '/tmp/videos-dados'}/ids.json`, 'utf8'));
const cli = { id: (await query("select id from usuarios where email='maria@exemplo.com'")).rows[0].id as string, papel: 'cliente' as const };
const C = '2026-10';
const ls = await K.listarConciliacao(cli, ids.A, C);
// 3 lançamentos ficam para a cena: 1 sem categoria + 2 sem exigência de cliente/fornecedor
const sem = ls.filter((l) => !l.revisado && l.conta_codigo == null).slice(0, 1);
const outros = ls.filter((l) => !l.revisado && l.conta_codigo != null && !K.participanteExigido(l.conta_codigo)).slice(0, 2);
const deixar = new Set([...sem, ...outros].map((l) => l.id));
for (const l of ls) {
  if (l.revisado && (l.nota_fiscal || l.sem_nota) && (!K.participanteExigido(l.conta_codigo) || l.participante_id)) continue;
  if (deixar.has(l.id)) continue;
  if (!l.revisado) await K.classificarEmLote(cli, [l.id], l.conta_codigo ?? K.CODIGO_NAO_SEI);
  if (!l.nota_fiscal && !l.sem_nota) await K.marcarSemNota(cli, [l.id]);
}
for (const l of await K.listarConciliacao(cli, ids.A, C)) {
  const t = K.participanteExigido(l.conta_codigo);
  if (t && !l.participante_id && !deixar.has(l.id)) {
    const s = sugerirParticipante(l.descricao_original);
    const p = await K.criarParticipante(cli, ids.A, { tipo: t, nome: s.nome || 'Cadastro exemplo', documento: s.documento });
    await K.definirParticipante(cli, [l.id], p.id);
  }
}
console.log('deixados para a cena:', [...deixar].length);
process.exit(0);
export {};
