import { notFound } from 'next/navigation';
import { exigirUsuario } from '@/lib/session';
import { obterEmpresa, usuariosDaEmpresa } from '@/lib/services/empresas';
import { cpfFormatado, listarSocios } from '@/lib/services/informes';
import { AppError } from '@/lib/errors';
import { listarRetiradas, TIPOS_RETIRADA } from '@/lib/services/retiradas';
import { acaoReabrirRetiradas } from '../../../../retiradas-actions';
import { Avisos, CompetenciaSeletor, Topo, competenciaDe } from '../../../../components';
import { acaoAcessoSocio, acaoAtivarSocio, acaoCriarSocio, acaoEditarSocio } from '../../../../informes-actions';

const dt = (d: string | Date) => new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
export default async function InformesAdmin({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ erro?: string; ok?: string; competencia?: string }> }) {
  const u = await exigirUsuario('admin'); const { id } = await params; const sp = await searchParams;
  let e; try { e = await obterEmpresa(u, id); } catch (x) { if (x instanceof AppError) notFound(); throw x; }
  const comp = competenciaDe(sp.competencia);
  const [socios, usuarios, ret] = await Promise.all([listarSocios(u, id), usuariosDaEmpresa(u, id), listarRetiradas(u, id, comp)]);
  const campos = (s?: (typeof socios)[number]) => (<div className="grid"><div><label>Nome *</label><input name="nome" defaultValue={s?.nome} required /></div><div><label>CPF *</label><input name="cpf" defaultValue={s ? cpfFormatado(s.cpf) : ''} required /></div>
    <div><label>E-mail</label><input name="email" type="email" defaultValue={s?.email ?? ''} /></div>
    <div><label><input type="checkbox" name="restrito" defaultChecked={s?.restrito ?? true} style={{ width: 'auto' }} /> Acesso restrito (só usuários autorizados abaixo veem os informes deste sócio)</label></div></div>);
  return (<><Topo u={u} /><main>
    <p><a href={`/admin/empresas/${id}`}>← Empresa</a></p><h1>Sócios e retiradas — {e.razao_social}</h1><Avisos erro={sp.erro} ok={sp.ok} />
    <CompetenciaSeletor atual={comp} />
    <div className="card" id="retiradas"><h2>Retiradas informadas pelo cliente — {comp.slice(5)}/{comp.slice(0, 4)}</h2>
      <p>{ret.envio ? <><span className="tag">{ret.envio.sem_retiradas ? 'Cliente informou: sem retiradas' : 'Enviado pelo cliente'}</span> {ret.envio.enviado_por} · {dt(ret.envio.enviado_em)}</> : <span className="tag off">Cliente ainda não enviou{ret.itens.length ? ' (lançando)' : ''}</span>}</p>
      <table><thead><tr><th>Data</th><th>Sócio</th><th>Tipo</th><th style={{ textAlign: 'right' }}>Valor</th><th>Observação</th></tr></thead><tbody>
        {ret.itens.map((i) => <tr key={i.id}><td>{i.data.split('-').reverse().join('/')}</td><td>{i.socio_nome}</td><td>{TIPOS_RETIRADA[i.tipo]}</td><td style={{ textAlign: 'right' }}>{Number(i.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td><td className="soon">{i.observacao}</td></tr>)}
        {!ret.itens.length && <tr><td colSpan={5} className="soon">Nenhuma retirada lançada neste mês.</td></tr>}
        {ret.itens.length > 0 && <tr><td colSpan={3}><strong>Total do mês</strong>{ret.totais.map((t) => <div key={t.socio} className="soon">{t.socio}: {t.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>)}</td><td style={{ textAlign: 'right' }}><strong>{ret.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></td><td></td></tr>}
      </tbody></table>
      <div className="row" style={{ marginTop: 10 }}>
        {ret.itens.length > 0 && <a className="btn sec" href={`/api/retiradas/exportar?empresaId=${id}&competencia=${comp}`}>Baixar Excel</a>}
        {ret.envio && <form action={acaoReabrirRetiradas}><input type="hidden" name="empresaId" value={id} /><input type="hidden" name="competencia" value={comp} /><button className="sec">Devolver ao cliente para correção</button></form>}
      </div></div>
    <div className="card"><h2>Sócios</h2>
      {socios.map((s) => { const livres = usuarios.filter((x) => x.ativo && !s.usuarios.some((a) => a.id === x.id)); return (
        <details key={s.id} style={{ borderBottom: '1px solid var(--bd)', padding: '8px 0' }}><summary><strong>{s.nome}</strong> · CPF {cpfFormatado(s.cpf)} · {s.restrito ? 'acesso restrito' : 'visível a todos os usuários da empresa'} {!s.ativo && <span className="tag off">inativo</span>}</summary>
          <p><strong>Usuários autorizados:</strong> {s.usuarios.length ? s.usuarios.map((a) => (<form key={a.id} action={acaoAcessoSocio} style={{ display: 'inline' }}><input type="hidden" name="empresaId" value={id} /><input type="hidden" name="socioId" value={s.id} /><input type="hidden" name="usuarioId" value={a.id} /><input type="hidden" name="modo" value="remover" /><span className="tag">{a.nome} <button className="sec" style={{ padding: '0 6px' }} title="Remover acesso">×</button></span> </form>)) : <span className="soon">ninguém — {s.restrito ? 'nenhum cliente verá os informes deste sócio' : 'não necessário (sem restrição)'}</span>}</p>
          {livres.length > 0 && <form action={acaoAcessoSocio} className="row"><input type="hidden" name="empresaId" value={id} /><input type="hidden" name="socioId" value={s.id} /><input type="hidden" name="modo" value="permitir" /><div><label>Autorizar usuário</label><select name="usuarioId">{livres.map((x) => <option key={x.id} value={x.id}>{x.nome} ({x.email})</option>)}</select></div><button>Autorizar</button></form>}
          <form action={acaoEditarSocio}><input type="hidden" name="empresaId" value={id} /><input type="hidden" name="id" value={s.id} />{campos(s)}<p><button>Salvar sócio</button></p></form>
          <form action={acaoAtivarSocio}><input type="hidden" name="empresaId" value={id} /><input type="hidden" name="id" value={s.id} /><input type="hidden" name="ativo" value={String(!s.ativo)} /><button className="sec">{s.ativo ? 'Desativar sócio' : 'Reativar sócio'}</button></form></details>); })}
      {!socios.length && <p className="soon">Nenhum sócio cadastrado.</p>}
      <h3>Novo sócio</h3><form action={acaoCriarSocio}><input type="hidden" name="empresaId" value={id} />{campos()}<p><button>Cadastrar sócio</button></p></form></div>

  </main></>);
}
