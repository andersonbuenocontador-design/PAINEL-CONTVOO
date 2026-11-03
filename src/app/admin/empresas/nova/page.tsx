import Link from 'next/link';
import { exigirUsuario } from '@/lib/session';
import { query } from '@/lib/db';
import { Avisos, Topo } from '../../../components';
import { acaoCriarEmpresa } from '../../actions';

/** Cadastro de nova empresa (aberto pelo botão "Cadastrar nova empresa"). */
export default async function NovaEmpresa({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const u = await exigirUsuario('admin'); const { erro } = await searchParams;
  const admins = await query(`SELECT id,nome FROM usuarios WHERE papel='admin' AND ativo ORDER BY nome`);
  return (<><Topo u={u} /><main>
    <p><Link href="/admin/entregas">← Entregas do mês</Link></p><h1>Nova empresa</h1><Avisos erro={erro} />
    <div className="card" id="nova">
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
