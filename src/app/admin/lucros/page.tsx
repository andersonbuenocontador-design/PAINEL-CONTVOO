import Link from 'next/link';
import { exigirUsuario } from '@/lib/session';
import { visaoLucros } from '@/lib/services/lucros';
import { CompetenciaSeletor, Topo, competenciaDe } from '../../components';
import { brlCent, STATUS_LUCROS } from './util';

/** Aba "Lucros dos sócios": todas as empresas do mês, comparando o que o cliente informou com o extrato. */
export default async function Lucros({ searchParams }: { searchParams: Promise<{ competencia?: string; so?: string }> }) {
  const u = await exigirUsuario('admin'); const sp = await searchParams; const comp = competenciaDe(sp.competencia);
  const todas = await visaoLucros(u, comp);
  const lista = sp.so ? todas.filter((x) => x.status === sp.so) : todas.filter((x) => x.status !== 'sem_movimento');
  const n = (s: keyof typeof STATUS_LUCROS) => todas.filter((x) => x.status === s).length;
  return (<><Topo u={u} /><main className="lucros">
    <h1>Lucros dos sócios</h1>
    <p className="soon">Compara as retiradas que o cliente informou, dia a dia, com as saídas do extrato bancário. Aponta o que ele pode ter esquecido de lançar, o que não aparece no extrato e os valores diferentes.</p>
    <CompetenciaSeletor atual={comp} />
    <div className="lucros-cartoes">{(['atencao', 'aguardando_extrato', 'ok'] as const).map((s) => (
      <Link key={s} href={`/admin/lucros?competencia=${comp}&so=${s}`} className={`card lucros-cartao ${STATUS_LUCROS[s].cls}`} aria-current={sp.so === s ? 'true' : undefined}>
        <span>{STATUS_LUCROS[s].txt}</span><strong>{n(s)}</strong></Link>))}</div>
    <p>{sp.so ? <Link href={`/admin/lucros?competencia=${comp}`}>Mostrar todas com movimento</Link> : <Link href={`/admin/lucros?competencia=${comp}&so=sem_movimento`}>Ver empresas sem retirada nem extrato ({n('sem_movimento')})</Link>}</p>
    <div className="card"><table><thead><tr><th>Empresa</th><th>Situação</th><th style={{ textAlign: 'right' }}>Informado pelo cliente</th><th style={{ textAlign: 'right' }}>Retiradas no extrato</th><th>Pontos de atenção</th><th></th></tr></thead><tbody>
      {lista.map((x) => { const r = x.resumo; const pts = [
        r.esquecidas && `${r.esquecidas} possível(is) esquecida(s) · ${brlCent(r.totalEsquecido)}`,
        r.naoEncontradas && `${r.naoEncontradas} não achada(s) no extrato`,
        r.divergentes && `${r.divergentes} com valor diferente`,
        x.acimaDoLimite.length && `acima de R$ 50 mil: ${x.acimaDoLimite.map((a) => a.socio.split(' ')[0]).join(', ')}`,
        !x.envio && r.informadas && 'cliente ainda não enviou o mês',
      ].filter(Boolean);
        return (<tr key={x.empresa.id}><td><Link href={`/admin/lucros/${x.empresa.id}?competencia=${comp}`}>{x.empresa.razao_social}</Link></td>
          <td><span className={`chip-lucro ${STATUS_LUCROS[x.status].cls}`}>{STATUS_LUCROS[x.status].txt}</span>{x.envio?.sem_retiradas && <div className="soon">cliente disse: sem retiradas</div>}</td>
          <td style={{ textAlign: 'right' }}>{brlCent(r.totalInformado)}<div className="soon">{r.informadas} lançamento(s)</div></td>
          <td style={{ textAlign: 'right' }}>{r.extratoNoMes ? brlCent(r.totalExtrato) : <span className="soon">sem extrato</span>}</td>
          <td className={pts.length ? 'lucros-atencao' : 'soon'}>{pts.length ? pts.map((p) => <div key={String(p)}>{p}</div>) : r.conferidas ? `${r.conferidas} conferida(s)` : '—'}</td>
          <td><Link className="btn sec" href={`/admin/lucros/${x.empresa.id}?competencia=${comp}`}>Abrir</Link></td></tr>); })}
      {!lista.length && <tr><td colSpan={6} className="soon">Nenhuma empresa nesta situação.</td></tr>}
    </tbody></table></div>
  </main></>);
}
