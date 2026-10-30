import { exigirUsuario } from '@/lib/session';
import { listarUsuarios } from '@/lib/services/usuarios';
import { listarEmpresas } from '@/lib/services/empresas';
import { Avisos, Topo } from '../../components';
import { acaoAtivoUsuario, acaoCriarUsuario, acaoSenhaUsuario } from '../actions';
import { acaoRedefinirMfa } from '../../seguranca-actions';

export default async function Usuarios({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string }> }) {
  const u = await exigirUsuario('admin'); const { erro, ok } = await searchParams;
  const [usuarios, empresas] = await Promise.all([listarUsuarios(u), listarEmpresas(u)]);
  return (<><Topo u={u} /><main><h1>Usuários</h1><Avisos erro={erro} ok={ok} />
    <div className="card"><table><thead><tr><th>Nome</th><th>Tipo</th><th>Empresas</th><th>Acesso</th><th></th></tr></thead><tbody>
      {usuarios.map((x) => (<tr key={x.id}><td>{x.nome}<div className="soon">{x.email}</div></td><td>{x.papel}</td>
        <td>{x.papel === 'admin' ? <span className="soon">todas</span> : (x.empresas as { id: string; razao_social: string }[]).map((e) => e.razao_social).join(', ') || <span className="soon">nenhuma</span>}</td>
        <td><span className={`tag ${x.ativo ? '' : 'off'}`}>{x.ativo ? 'ativo' : 'bloqueado'}</span>{x.mfa_ativo && <form action={acaoRedefinirMfa} style={{ marginTop: 6 }}><input type="hidden" name="id" value={x.id} /><button className="sec" title="Perdeu o celular? Desliga a verificação em duas etapas desta pessoa">Redefinir 2FA</button></form>}</td>
        <td><div className="row">
          <form action={acaoAtivoUsuario}><input type="hidden" name="id" value={x.id} /><input type="hidden" name="ativo" value={String(!x.ativo)} /><button className="sec" disabled={x.id === u.id}>{x.ativo ? 'Bloquear' : 'Reativar'}</button></form>
          <form action={acaoSenhaUsuario} className="row"><input type="hidden" name="id" value={x.id} /><input name="senha" placeholder="Nova senha temporária" minLength={10} required style={{ width: 190 }} autoComplete="off" /><button className="sec">Redefinir senha</button></form>
        </div></td></tr>))}</tbody></table></div>
    <div className="card"><h2>Novo usuário</h2>
      <form action={acaoCriarUsuario}><div className="grid">
        <div><label>Nome *</label><input name="nome" required /></div><div><label>E-mail *</label><input name="email" type="email" required /></div>
        <div><label>Tipo *</label><select name="papel"><option value="cliente">Cliente</option><option value="admin">Administrador do escritório</option></select></div>
        <div><label>Senha temporária * (mín. 10)</label><input name="senha" minLength={10} required autoComplete="off" /></div>
        <div><label>Empresas (somente clientes)</label><select name="empresaIds" multiple size={5}>{empresas.map((e) => <option key={e.id} value={e.id}>{e.razao_social}</option>)}</select></div>
      </div><p><button>Criar usuário</button></p></form></div></main></>);
}
