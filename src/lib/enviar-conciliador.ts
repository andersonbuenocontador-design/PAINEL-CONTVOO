import { complementoDe } from './complemento';
import type { LinhaConciliacao } from './services/conciliacao';

/**
 * Ao concluir a conciliação, envia as linhas ao n8n (tabela "conciliacoes_concluidas"), de onde o
 * Conciliador Contvoo (Integrador > Painel do cliente) as lê. Não quebra a conclusão se falhar.
 * Variáveis: N8N_CONCILIACAO_URL e N8N_CONCILIACAO_TOKEN (sem elas, não envia).
 */
export async function enviarAoConciliador(emp: { id: string; razao_social: string; cnpj: string }, competencia: string, ls: LinhaConciliacao[]) {
  const url = process.env.N8N_CONCILIACAO_URL, token = process.env.N8N_CONCILIACAO_TOKEN;
  if (!url || !token) return;
  try {
    const linhas = ls.map((l) => ({
      d: l.data, o: l.descricao_original, c: l.conta_nome ?? '', cod: l.conta_codigo, nf: l.nota_fiscal ?? '', p: complementoDe(l),
      v: l.valor / 100, b: l.banco, m: l.observacao ?? '',
    }));
    const r = await fetch(url, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-token': token }, signal: AbortSignal.timeout(20000),
      body: JSON.stringify({ chave: `${emp.id}|${competencia}`, cnpj: emp.cnpj.replace(/\D/g, ''), razao: emp.razao_social, competencia, concluida_em: new Date().toISOString(), qtd: linhas.length, linhas: JSON.stringify(linhas) }),
    });
    if (!r.ok) console.error('[conciliador] n8n respondeu', r.status);
  } catch (e) { console.error('[conciliador] falha ao enviar', e instanceof Error ? e.message : e); }
}
