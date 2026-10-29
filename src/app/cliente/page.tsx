import Link from 'next/link';
import { redirect } from 'next/navigation';
import { exigirUsuario } from '@/lib/session';
import { listarEmpresas } from '@/lib/services/empresas';
import { formatarCnpj } from '@/lib/cnpj';
import { resumoPendencias } from '@/lib/services/pendencias';
import { Topo } from '../components';

export default async function ClienteHome() {
  const u = await exigirUsuario('cliente');
  const empresas = await listarEmpresas(u);
  if (empresas.length === 1) redirect(`/cliente/${empresas[0].id}`);
  const pend = new Map(await Promise.all(empresas.map(async (e) => [e.id, await resumoPendencias(u, e.id)] as const)));
  return (<><Topo u={u} /><main><h1>Minhas empresas</h1>
    {!empresas.length && <div className="card">Nenhuma empresa liberada para o seu acesso. Fale com o escritório.</div>}
    <div className="grid">{empresas.map((e) => (<Link key={e.id} href={`/cliente/${e.id}`} className="card" style={{ color: 'inherit', textDecoration: 'none' }}><h2>{e.razao_social}</h2><span className="soon">{formatarCnpj(e.cnpj)}</span>{pend.get(e.id)!.aguardando > 0 && <div style={{ color: 'var(--err)', marginTop: 6 }}>{pend.get(e.id)!.aguardando} solicitação(ões) aguardando você</div>}</Link>))}</div></main></>);
}
