import { redirect } from 'next/navigation';
import { exigirUsuario } from '@/lib/session';
import { listarEmpresas } from '@/lib/services/empresas';
import { formatarCnpj } from '@/lib/cnpj';
import { resumoPendencias } from '@/lib/services/pendencias';
import { Atalho, Topo, saudacaoDoHorario } from '../components';

export default async function ClienteHome() {
  const u = await exigirUsuario('cliente');
  const empresas = await listarEmpresas(u);
  if (empresas.length === 1) redirect(`/cliente/${empresas[0].id}`);
  const pend = new Map(await Promise.all(empresas.map(async (e) => [e.id, await resumoPendencias(u, e.id)] as const)));
  return (<><Topo u={u} /><main><h1>{saudacaoDoHorario()}, {u.nome.split(' ')[0]}!</h1><p className="soon">Escolha a empresa:</p>
    {!empresas.length && <div className="card">Nenhuma empresa liberada para o seu acesso. Fale com o escritório.</div>}
    <div className="hub">{empresas.map((e) => { const n = pend.get(e.id)!.aguardando; return (
      <Atalho key={e.id} href={`/cliente/${e.id}`} icone="predio" titulo={e.razao_social} desc={formatarCnpj(e.cnpj)} info={n ? `${n} solicitação(ões) aguardando você` : undefined} alerta={n > 0} />); })}</div></main></>);
}
