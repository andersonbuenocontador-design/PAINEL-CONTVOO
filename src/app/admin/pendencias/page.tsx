import Link from 'next/link';
import { exigirUsuario } from '@/lib/session';
import { CATEGORIAS, listarPendenciasEscritorio, type FiltroPend } from '@/lib/services/pendencias';
import { SIT_PEND } from '@/lib/exportar';
import { Topo } from '../../components';

type SP = { situacao?: string; categoria?: string; vencidas?: string; busca?: string; competencia?: string };
export default async function Pendencias({ searchParams }: { searchParams: Promise<SP> }) {
  const u = await exigirUsuario('admin'); const sp = await searchParams;
  const f: FiltroPend = { situacao: (sp.situacao ?? 'em_andamento') as FiltroPend['situacao'], categoria: (sp.categoria || undefined) as FiltroPend['categoria'], vencidas: sp.vencidas === '1', busca: sp.busca, competencia: sp.competencia || undefined };
  if (sp.situacao === 'todas') f.situacao = undefined;
  const lista = await listarPendenciasEscritorio(u, f);
  const qs = new URLSearchParams(Object.entries({ situacao: sp.situacao === 'todas' ? '' : (sp.situacao ?? 'em_andamento'), categoria: sp.categoria ?? '', vencidas: sp.vencidas ?? '', busca: sp.busca ?? '', competencia: sp.competencia ?? '' }).filter(([, v]) => v)).toString();
  return (<><Topo u={u} /><main><h1>Pendências de todas as empresas</h1>
    <form method="get" className="card"><div className="grid">
      <div><label>Situação</label><select name="situacao" defaultValue={sp.situacao ?? 'em_andamento'}><option value="em_andamento">Em andamento</option><option value="aberta">Aguardando o cliente</option><option value="respondida">Aguardando o escritório</option><option value="resolvida">Resolvidas</option><option value="cancelada">Canceladas</option><option value="todas">Todas</option></select></div>
      <div><label>Categoria</label><select name="categoria" defaultValue={sp.categoria ?? ''}><option value="">Todas</option>{Object.entries(CATEGORIAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
      <div><label>Competência</label><input type="month" name="competencia" defaultValue={sp.competencia ?? ''} /></div>
      <div><label>Empresa</label><input name="busca" defaultValue={sp.busca ?? ''} placeholder="Nome da empresa" /></div></div>
      <p><label style={{ display: 'inline' }}><input type="checkbox" name="vencidas" value="1" defaultChecked={sp.vencidas === '1'} style={{ width: 'auto' }} /> Só vencidas</label> <button>Filtrar</button> <a className="btn sec" href={`/api/pendencias/exportar?${qs}`}>Exportar (Excel)</a></p></form>
    <div className="card"><p className="soon">{lista.length} pendência(s){lista.length === 1000 ? ' (limite de 1000; refine os filtros)' : ''}</p><table><thead><tr><th>Empresa</th><th>Categoria</th><th>Descrição</th><th>Prazo</th><th>Situação</th><th>Responsável</th><th></th></tr></thead><tbody>
      {lista.map((p) => (<tr key={p.id} style={p.vencida ? { background: '#fef3f2' } : undefined}><td>{p.razao_social}</td><td>{CATEGORIAS[p.categoria]}{p.competencia && <div className="soon">{p.competencia.slice(5)}/{p.competencia.slice(0, 4)}</div>}</td><td>{p.descricao.slice(0, 110)}{p.descricao.length > 110 ? '…' : ''}</td>
        <td>{p.prazo ? p.prazo.split('-').reverse().join('/') : '—'}{p.vencida && <div style={{ color: 'var(--err)' }}>vencida</div>}</td><td><span className="tag">{SIT_PEND[p.situacao]}</span></td><td>{p.responsavel ?? '—'}</td>
        <td><Link href={`/admin/empresas/${p.empresa_id}/pendencias`}>Abrir</Link></td></tr>))}
      {!lista.length && <tr><td colSpan={7} className="soon">Nenhuma pendência com esses filtros.</td></tr>}</tbody></table></div></main></>);
}
