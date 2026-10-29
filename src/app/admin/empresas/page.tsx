import Link from 'next/link';
import { exigirUsuario } from '@/lib/session';
import { listarEmpresas } from '@/lib/services/empresas';
import { query } from '@/lib/db';
import { formatarCnpj } from '@/lib/cnpj';
import { Avisos, Topo } from '../../components';
import { acaoCriarEmpresa } from '../actions';

export default async function Empresas({ searchParams }: { searchParams: Promise<{ q?: string; erro?: string; ok?: string }> }) {
  const u = await exigirUsuario('admin');
  const { q, erro, ok } = await searchParams;
  const [empresas, admins] = await Promise.all([listarEmpresas(u, q), query(`SELECT id,nome FROM usuarios WHERE papel='admin' AND ativo ORDER BY nome`)]);
  return (<><Topo u={u} /><main>
    <h1>Empresas</h1><Avisos erro={erro} ok={ok} />
    <form className="card row" method="get"><div style={{ flex: 1 }}><label htmlFor="q">Buscar por nome ou CNPJ</label><input id="q" name="q" defaultValue={q} /></div><button>Buscar</button></form>
    <div className="card"><table><thead><tr><th>Razão social</th><th>CNPJ</th><th>Situação</th><th></th></tr></thead><tbody>
      {empresas.map((e) => (<tr key={e.id}><td>{e.razao_social}{e.nome_fantasia && <div className="soon">{e.nome_fantasia}</div>}</td><td>{formatarCnpj(e.cnpj)}</td><td><span className={`tag ${e.situacao === 'inativa' ? 'off' : ''}`}>{e.situacao}</span></td><td><Link href={`/admin/empresas/${e.id}`}>Abrir</Link></td></tr>))}
      {!empresas.length && <tr><td colSpan={4} className="soon">Nenhuma empresa encontrada.</td></tr>}
    </tbody></table></div>
    <div className="card"><h2>Nova empresa</h2>
      <form action={acaoCriarEmpresa}><div className="grid">
        <div><label>Razão social *</label><input name="razaoSocial" required /></div>
        <div><label>Nome fantasia</label><input name="nomeFantasia" /></div>
        <div><label>CNPJ *</label><input name="cnpj" required inputMode="numeric" /></div>
        <div><label>E-mail de contato</label><input name="emailContato" type="email" /></div>
        <div><label>Responsável no escritório</label><select name="responsavelId"><option value="">—</option>{admins.rows.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}</select></div>
        <div><label>Início de uso do painel</label><input name="inicioUso" type="date" /></div>
      </div><p><button>Cadastrar</button></p></form></div>
  </main></>);
}
