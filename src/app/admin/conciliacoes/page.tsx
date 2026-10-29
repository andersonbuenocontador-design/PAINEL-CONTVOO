import Link from 'next/link';
import { exigirUsuario } from '@/lib/session';
import { listarConciliacoesEscritorio } from '@/lib/services/conciliacao';
import { CompetenciaSeletor, Topo, competenciaDe } from '../../components';

const ROT = { revisao: 'Cliente preenchendo', enviada: 'Aguardando conferência', devolvida: 'Devolvida ao cliente', concluida: 'Concluída' } as const;
export default async function Conciliacoes({ searchParams }: { searchParams: Promise<{ competencia?: string; so?: string }> }) {
  const u = await exigirUsuario('admin'); const sp = await searchParams; const comp = competenciaDe(sp.competencia);
  const fila = await listarConciliacoesEscritorio(u, comp);
  const por = (s: string) => fila.filter((f) => f.status === s).length;
  const lista = sp.so ? fila.filter((f) => f.status === sp.so) : fila;
  return (<><Topo u={u} /><main><h1>Conciliações da competência</h1><CompetenciaSeletor atual={comp} />
    <div className="grid">{(['enviada', 'devolvida', 'revisao', 'concluida'] as const).map((s) => (
      <Link key={s} href={`/admin/conciliacoes?competencia=${comp}&so=${s}`} className="card" style={{ color: 'inherit', textDecoration: 'none' }}><h2>{ROT[s]}</h2><strong style={{ fontSize: '2rem' }}>{por(s)}</strong></Link>))}</div>
    <p><Link href={`/admin/conciliacoes?competencia=${comp}`}>Mostrar todas</Link> · <a href={`/api/conciliacao/fila?competencia=${comp}`}>Exportar lista (Excel)</a></p>
    <div className="card"><table><thead><tr><th>Empresa</th><th>Situação</th><th>Movimentações</th><th>Sem conta</th><th>Para revisar</th><th>Correções pedidas</th><th></th></tr></thead><tbody>
      {lista.map((f) => (<tr key={f.id}><td>{f.razao_social}</td><td><span className={`tag ${f.status === 'enviada' ? '' : 'off'}`}>{ROT[f.status]}</span>{f.enviada_em && f.status === 'enviada' && <div className="soon">enviada em {new Date(f.enviada_em).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</div>}</td>
        <td>{f.linhas}</td><td>{f.sem_conta}</td><td>{f.nao_rev}</td><td>{f.correcoes}</td><td><Link href={`/admin/empresas/${f.id}/extratos?competencia=${comp}`}>{f.status === 'enviada' ? 'Conferir' : 'Abrir'}</Link></td></tr>))}
      {!lista.length && <tr><td colSpan={7} className="soon">Nenhuma empresa nesta situação.</td></tr>}</tbody></table></div></main></>);
}
