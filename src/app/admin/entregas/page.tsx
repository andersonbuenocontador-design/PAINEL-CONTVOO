import Link from 'next/link';
import { exigirUsuario } from '@/lib/session';
import { visaoGeral } from '@/lib/services/documentos';
import { Topo, CompetenciaSeletor, competenciaDe } from '../../components';

export default async function Entregas({ searchParams }: { searchParams: Promise<{ competencia?: string }> }) {
  const u = await exigirUsuario('admin'); const comp = competenciaDe((await searchParams).competencia);
  const v = await visaoGeral(u, comp);
  const concluidas = v.filter((e) => e.concluida).length, semConfig = v.filter((e) => e.exigidos === 0).length;
  return (<><Topo u={u} /><main>
    <p><Link href="/admin">← Início</Link></p><h1>Entregas do mês</h1><CompetenciaSeletor atual={comp} />
    <div className="grid">
      <div className="card"><h2>Concluídas</h2><strong style={{ fontSize: '2rem' }}>{concluidas}</strong><p className="soon">de {v.length} empresas ativas</p></div>
      <div className="card"><h2>Com pendências</h2><strong style={{ fontSize: '2rem' }}>{v.filter((e) => e.pendentes > 0).length}</strong></div>
      <div className="card"><h2>Com rejeitados</h2><strong style={{ fontSize: '2rem' }}>{v.filter((e) => e.rejeitados > 0).length}</strong></div>
      <div className="card"><h2>Sem documentos configurados</h2><strong style={{ fontSize: '2rem' }}>{semConfig}</strong></div>
    </div>
    <div className="card"><table><thead><tr><th>Empresa</th><th>Exigidos</th><th>Enviados</th><th>Aprovados</th><th>Rejeitados</th><th>Pendentes</th><th>%</th><th></th></tr></thead><tbody>
      {v.map((e) => (<tr key={e.id}><td>{e.razao_social}</td><td>{e.exigidos}</td><td>{e.enviados}</td><td>{e.aprovados}</td><td>{e.rejeitados}</td><td>{e.pendentes}</td><td>{e.percentual}%</td><td><Link href={`/admin/empresas/${e.id}/documentos?competencia=${comp}`}>Conferir</Link></td></tr>))}
      {!v.length && <tr><td colSpan={8} className="soon">Nenhuma empresa ativa.</td></tr>}</tbody></table></div>
  </main></>);
}
