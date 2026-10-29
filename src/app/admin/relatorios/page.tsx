import Link from 'next/link';
import { exigirUsuario } from '@/lib/session';
import { visaoGeral } from '@/lib/services/documentos';
import { listarConciliacoesEscritorio } from '@/lib/services/conciliacao';
import { listarPendenciasEscritorio } from '@/lib/services/pendencias';
import { CompetenciaSeletor, Topo, competenciaDe } from '../../components';

export default async function Relatorios({ searchParams }: { searchParams: Promise<{ competencia?: string }> }) {
  const u = await exigirUsuario('admin'); const comp = competenciaDe((await searchParams).competencia);
  const [docs, conc, pend] = await Promise.all([visaoGeral(u, comp), listarConciliacoesEscritorio(u, comp), listarPendenciasEscritorio(u, { situacao: 'em_andamento' })]);
  const n = (a: unknown[]) => a.length; const c = (s: string) => conc.filter((x) => x.status === s).length;
  const comExig = docs.filter((d) => d.exigidos > 0);
  return (<><Topo u={u} /><main><h1>Relatório geral da competência</h1><CompetenciaSeletor atual={comp} />
    <p><a className="btn" href={`/api/relatorios/geral?competencia=${comp}`}>Baixar relatório completo (Excel)</a> <span className="soon">Abas: Documentos, Conciliações e Pendências em andamento.</span></p>
    <div className="grid">
      <div className="card"><h2>Documentos</h2><p><strong>{comExig.filter((d) => d.concluida).length}</strong> de {n(comExig)} empresas com tudo aprovado</p><p className="soon">{comExig.filter((d) => d.pendentes > 0).length} com pendências · {comExig.filter((d) => d.rejeitados > 0).length} com rejeitados · {docs.length - n(comExig)} sem documentos configurados</p><Link href={`/admin?competencia=${comp}`}>Ver entregas</Link></div>
      <div className="card"><h2>Conciliações</h2><p><strong>{c('concluida')}</strong> concluídas de {n(conc)}</p><p className="soon">{c('enviada')} aguardando conferência · {c('devolvida')} devolvidas · {c('revisao')} com o cliente</p><Link href={`/admin/conciliacoes?competencia=${comp}`}>Ver conciliações</Link></div>
      <div className="card"><h2>Pendências</h2><p><strong>{n(pend)}</strong> em andamento</p><p className="soon">{pend.filter((p) => p.vencida).length} vencidas · {pend.filter((p) => p.situacao === 'aberta').length} aguardam o cliente · {pend.filter((p) => p.situacao === 'respondida').length} aguardam o escritório</p><Link href="/admin/pendencias">Ver pendências</Link></div></div></main></>);
}
