import { exigirUsuario } from '@/lib/session';
import { obterEmpresa, usuariosDaEmpresa } from '@/lib/services/empresas';
import { query } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { notFound } from 'next/navigation';
import { Avisos, Topo } from '../../../components';
import { acaoEditarEmpresa, acaoSituacaoEmpresa, acaoVincular, acaoCriarUsuario } from '../../actions';

export default async function EmpresaDetalhe({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ erro?: string; ok?: string }> }) {
  const u = await exigirUsuario('admin');
  const { id } = await params; const { erro, ok } = await searchParams;
  let e; try { e = await obterEmpresa(u, id); } catch (x) { if (x instanceof AppError) notFound(); throw x; }
  const [admins, vinculados, clientes] = await Promise.all([
    query(`SELECT id,nome FROM usuarios WHERE papel='admin' AND ativo ORDER BY nome`),
    usuariosDaEmpresa(u, id),
    query(`SELECT id,nome,email FROM usuarios WHERE papel='cliente' AND ativo AND id NOT IN (SELECT usuario_id FROM usuario_empresas WHERE empresa_id=$1) ORDER BY nome`, [id]),
  ]);
  const voltar = `/admin/empresas/${id}`;
  return (<><Topo u={u} /><main>
    <h1>{e.razao_social} <span className={`tag ${e.situacao === 'inativa' ? 'off' : ''}`}>{e.situacao}</span></h1><Avisos erro={erro} ok={ok} />
    <p><a className="btn" href={`/admin/empresas/${id}/documentos`}>Documentos e conferência</a> <a className="btn sec" href={`/admin/empresas/${id}/extratos`}>Extratos e contas bancárias</a> <a className="btn sec" href={`/admin/empresas/${id}/informes`}>Sócios e informes</a> <a className="btn sec" href={`/admin/empresas/${id}/pendencias`}>Pendências</a></p>
    <div className="card"><h2>Dados da empresa</h2>
      <form action={acaoEditarEmpresa}><input type="hidden" name="id" value={id} /><div className="grid">
        <div><label>Razão social *</label><input name="razaoSocial" defaultValue={e.razao_social} required /></div>
        <div><label>Nome fantasia</label><input name="nomeFantasia" defaultValue={e.nome_fantasia ?? ''} /></div>
        <div><label>CNPJ *</label><input name="cnpj" defaultValue={e.cnpj} required /></div>
        <div><label>E-mail de contato</label><input name="emailContato" type="email" defaultValue={e.email_contato ?? ''} /></div>
        <div><label>Responsável</label><select name="responsavelId" defaultValue={e.responsavel_id ?? ''}><option value="">—</option>{admins.rows.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}</select></div>
        <div><label>Início de uso</label><input name="inicioUso" type="date" defaultValue={e.inicio_uso ? new Date(e.inicio_uso).toISOString().slice(0, 10) : ''} /></div>
      </div><p><button>Salvar</button></p></form>
      <form action={acaoSituacaoEmpresa}><input type="hidden" name="id" value={id} /><input type="hidden" name="situacao" value={e.situacao === 'ativa' ? 'inativa' : 'ativa'} />
        <button className={e.situacao === 'ativa' ? 'danger' : 'sec'}>{e.situacao === 'ativa' ? 'Desativar empresa' : 'Reativar empresa'}</button>
        <span className="soon"> Desativar não apaga documentos nem histórico.</span></form></div>
    <div className="card"><h2>Usuários com acesso</h2>
      <table><tbody>{vinculados.map((v) => (<tr key={v.id}><td>{v.nome}<div className="soon">{v.email}</div></td><td>{!v.ativo && <span className="tag off">bloqueado</span>}</td>
        <td><form action={acaoVincular}><input type="hidden" name="usuarioId" value={v.id} /><input type="hidden" name="empresaId" value={id} /><input type="hidden" name="modo" value="desvincular" /><input type="hidden" name="voltar" value={voltar} /><button className="sec">Remover acesso</button></form></td></tr>))}
        {!vinculados.length && <tr><td className="soon">Nenhum usuário vinculado.</td></tr>}</tbody></table>
      {clientes.rows.length > 0 && <form action={acaoVincular} className="row"><input type="hidden" name="empresaId" value={id} /><input type="hidden" name="modo" value="vincular" /><input type="hidden" name="voltar" value={voltar} />
        <div style={{ flex: 1 }}><label>Vincular usuário existente</label><select name="usuarioId">{clientes.rows.map((c) => <option key={c.id} value={c.id}>{c.nome} ({c.email})</option>)}</select></div><button>Vincular</button></form>}
    </div>
    <div className="card"><h2>Criar usuário para esta empresa</h2>
      <form action={acaoCriarUsuario}><input type="hidden" name="papel" value="cliente" /><input type="hidden" name="empresaIds" value={id} /><input type="hidden" name="voltar" value={voltar} /><div className="grid">
        <div><label>Nome *</label><input name="nome" required /></div><div><label>E-mail *</label><input name="email" type="email" required /></div>
        <div><label>Senha temporária * (mín. 10)</label><input name="senha" type="text" minLength={10} required autoComplete="off" /></div></div>
        <p className="soon">O usuário será obrigado a trocar a senha no primeiro acesso.</p><button>Criar usuário</button></form></div>
  </main></>);
}
