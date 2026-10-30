import Link from 'next/link';
import { exigirUsuario } from '@/lib/session';
import { listarEmpresas } from '@/lib/services/empresas';
import { formatarCnpj } from '@/lib/cnpj';
import { Avisos, Topo } from '../../components';
import { acaoCriarEmpresa } from '../actions';

export default async function Empresas({ searchParams }: { searchParams: Promise<{ q?: string; erro?: string; ok?: string }> }) {
  const u = await exigirUsuario('admin');
  const { q, erro, ok } = await searchParams;
  const empresas = await listarEmpresas(u, q);
  return (<><Topo u={u} /><main>
    <p><Link href="/admin/entregas">← Entregas do mês</Link></p><h1>Todas as empresas</h1><Avisos erro={erro} ok={ok} />
    <form className="card row" method="get"><div style={{ flex: 1 }}><label htmlFor="q">Buscar por nome ou CNPJ</label><input id="q" name="q" defaultValue={q} /></div><button>Buscar</button></form>
    <div className="card"><table><thead><tr><th>Razão social</th><th>CNPJ</th><th>Situação</th><th></th></tr></thead><tbody>
      {empresas.map((e) => (<tr key={e.id}><td>{e.razao_social}{e.nome_fantasia && <div className="soon">{e.nome_fantasia}</div>}</td><td>{formatarCnpj(e.cnpj)}</td><td><span className={`tag ${e.situacao === 'inativa' ? 'off' : ''}`}>{e.situacao}</span></td><td><Link href={`/admin/empresas/${e.id}`}>Abrir</Link></td></tr>))}
      {!empresas.length && <tr><td colSpan={4} className="soon">Nenhuma empresa encontrada.</td></tr>}
    </tbody></table></div>
  </main></>);
}
