// Diagnóstico do site em produção, rodado pelo GitHub Actions (workflow "Diagnóstico"): só lê, e mostra apenas situações,
// contagens e erros técnicos mascarados (sem nomes de clientes, CPFs, valores ou senhas). Saída: anotações ::notice::.
import pg from 'pg';
import { configPg } from '../src/lib/db';
import { diagnosticar } from '../src/lib/diagnostico';
process.on('uncaughtException', (e) => { console.log(`::error title=Diagnóstico falhou::${diagnosticar(e, 'banco')}`); process.exit(1); });
const c = new pg.Client(configPg());
try { await c.connect(); } catch (e) { console.log(`::error title=Sem conexão com o banco::${diagnosticar(e, 'banco')}`); process.exit(1); }
const q = async (sql: string) => (await c.query(sql)).rows;
const secao = (titulo: string, linhas: string[]) => console.log(`::notice title=${titulo}::${(linhas.length ? linhas : ['(nada)']).join('%0A').replace(/\r?\n/g, ' ')}`);
const dt = (d: Date) => new Date(d).toISOString().slice(0, 16).replace('T', ' ');
try {
  secao('Migrações', [(await q(`SELECT nome FROM _migracoes ORDER BY nome`)).map((r) => r.nome.slice(0, 3)).join(' ')]);
  const temErros = (await q(`SELECT to_regclass('public.erros_sistema') t`))[0].t;
  secao('Erros recentes do servidor (UTC)', temErros ? (await q(`SELECT criado_em, onde, mensagem FROM erros_sistema ORDER BY id DESC LIMIT 12`)).map((r) => `${dt(r.criado_em)} [${r.onde ?? '-'}] ${r.mensagem.slice(0, 600)}`) : ['tabela ainda não criada']);
  secao('Importações de extrato (últimas)', (await q(`SELECT i.criado_em, i.status, i.formato, i.competencia, lower(substring(i.nome_arquivo from '\\.[^.]+$')) ext, (i.resumo->>'registros') reg, (i.resumo->>'aImportar') imp, (i.resumo->>'foraPeriodo') fora, (i.resumo->>'duplicadasPossiveis') dup, u.papel
      FROM importacoes i JOIN usuarios u ON u.id=i.criado_por ORDER BY i.criado_em DESC LIMIT 15`)).map((r) => `${dt(r.criado_em)} ${r.papel} ${r.status} ${r.formato}${r.ext ?? ''} comp=${r.competencia} lidos=${r.reg} novos=${r.imp} foraMes=${r.fora} repetidos=${r.dup}`));
  secao('Lançamentos por competência', (await q(`SELECT competencia, count(*)::int n, count(DISTINCT conta_id)::int contas FROM movimentacoes GROUP BY 1 ORDER BY 1 DESC LIMIT 8`)).map((r) => `${r.competencia}: ${r.n} lançamentos em ${r.contas} conta(s)`));
  secao('Contas bancárias', (await q(`SELECT banco, ativo, count(*)::int n FROM contas_bancarias GROUP BY 1,2 ORDER BY 1`)).map((r) => `${r.banco}${r.ativo ? '' : ' (inativa)'}: ${r.n}`));
  secao('Ações recentes (auditoria)', (await q(`SELECT a.criado_em, a.acao, u.papel FROM auditoria a LEFT JOIN usuarios u ON u.id=a.usuario_id WHERE a.acao ~ '^(importacao|conta|arquivo|avulso|movimentacao|conciliacao)' ORDER BY a.id DESC LIMIT 20`)).map((r) => `${dt(r.criado_em)} ${r.papel ?? '-'} ${r.acao}`));
  secao('Documentos e arquivos', (await q(`SELECT (SELECT count(*) FROM arquivos)::int arquivos, (SELECT count(*) FROM documentos_avulsos WHERE removido_em IS NULL)::int avulsos, (SELECT count(*) FROM empresas)::int empresas, (SELECT count(*) FROM usuarios WHERE papel='cliente')::int clientes`)).map((r) => `arquivos=${r.arquivos} pdfs_avulsos=${r.avulsos} empresas=${r.empresas} usuarios_cliente=${r.clientes}`));
} finally { await c.end(); }
