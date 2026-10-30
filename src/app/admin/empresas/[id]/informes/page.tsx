import { notFound } from 'next/navigation';
import { exigirUsuario } from '@/lib/session';
import { obterEmpresa, usuariosDaEmpresa } from '@/lib/services/empresas';
import { cpfFormatado, historicoInforme, listarInformesAdmin, listarSocios, listarTipos } from '@/lib/services/informes';
import { AppError } from '@/lib/errors';
import { listarRetiradas, TIPOS_RETIRADA } from '@/lib/services/retiradas';
import { acaoReabrirRetiradas } from '../../../../retiradas-actions';
import { Avisos, CompetenciaSeletor, Topo, competenciaDe } from '../../../../components';
import { acaoAcessoSocio, acaoAtivarSocio, acaoAtivarTipo, acaoCriarInforme, acaoCriarSocio, acaoCriarTipo, acaoEditarSocio, acaoNovaVersao, acaoSituacaoInforme } from '../../../../informes-actions';

const SIT = { rascunho: 'Rascunho (cliente não vê)', disponivel: 'Disponível', retirado: 'Retirado' } as const;
const dt = (d: string | Date) => new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
export default async function InformesAdmin({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ erro?: string; ok?: string; competencia?: string }> }) {
  const u = await exigirUsuario('admin'); const { id } = await params; const sp = await searchParams;
  let e; try { e = await obterEmpresa(u, id); } catch (x) { if (x instanceof AppError) notFound(); throw x; }
  const comp = competenciaDe(sp.competencia);
  const [socios, informes, tipos, usuarios, ret] = await Promise.all([listarSocios(u, id), listarInformesAdmin(u, id), listarTipos(u, true), usuariosDaEmpresa(u, id), listarRetiradas(u, id, comp)]);
  const hist = new Map(await Promise.all(informes.map(async (i) => [i.id as string, await historicoInforme(u, i.id)] as const)));
  const ativos = socios.filter((s) => s.ativo); const tiposAtivos = tipos.filter((t) => t.ativo);
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

    <div className="card"><h2>Novo informe</h2>
      {!ativos.length ? <p className="soon">Cadastre um sócio primeiro.</p> : (<form action={acaoCriarInforme}><input type="hidden" name="empresaId" value={id} /><div className="grid">
        <div><label>Sócio *</label><select name="socioId">{ativos.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}</select></div>
        <div><label>Tipo de documento *</label><select name="tipoId">{tiposAtivos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}</select></div>
        <div><label>Ano-calendário *</label><input name="ano" type="number" min={2000} max={2100} defaultValue={new Date().getFullYear() - 1} required /></div>
        <div><label>Período (opcional)</label><input name="periodo" placeholder="Jan a Dez" /></div><div><label>Descrição (opcional)</label><input name="descricao" /></div>
        <div><label>Arquivo (PDF, XLSX, JPG ou PNG) *</label><input type="file" name="arquivo" required accept=".pdf,.xlsx,.jpg,.png" /></div></div>
        <label><input type="checkbox" name="disponibilizar" defaultChecked style={{ width: 'auto' }} /> Disponibilizar para o cliente agora</label><p><button>Enviar informe</button></p></form>)}</div>

    <div className="card"><h2>Informes cadastrados</h2><div style={{ overflowX: 'auto' }}><table><thead><tr><th>Ano</th><th>Sócio</th><th>Documento</th><th>Arquivo</th><th>Situação</th><th>Downloads</th><th>Ações</th></tr></thead><tbody>
      {informes.map((i) => { const h = hist.get(i.id)!; return (<tr key={i.id}><td>{i.ano_calendario}{i.periodo && <div className="soon">{i.periodo}</div>}</td><td>{i.socio}</td><td>{i.tipo}{i.descricao && <div className="soon">{i.descricao}</div>}</td>
        <td><a href={`/api/informes/${i.id}`}>{i.arquivo}</a><div className="soon">versão {i.versao_atual}</div>
          <details><summary className="soon">Histórico</summary>{h.versoes.map((v) => <div key={v.versao} className="soon">v{v.versao} · <a href={`/api/informes/${i.id}?v=${v.versao}`}>{v.nome_original}</a> · {v.enviado_por} · {dt(v.enviado_em)}</div>)}
            <div className="soon"><strong>Acessos:</strong> {h.acessos.length ? '' : 'nenhum download ainda'}</div>{h.acessos.map((a, k) => <div key={k} className="soon">{dt(a.criado_em)} · {a.usuario} ({a.papel === 'admin' ? 'escritório' : 'cliente'}) · v{a.versao}</div>)}</details></td>
        <td><span className={`tag ${i.situacao === 'disponivel' ? '' : 'off'}`}>{SIT[i.situacao as keyof typeof SIT]}</span>{i.disponibilizado_em && <div className="soon">desde {dt(i.disponibilizado_em)}</div>}</td><td>{i.downloads}</td>
        <td><form action={acaoSituacaoInforme}><input type="hidden" name="empresaId" value={id} /><input type="hidden" name="id" value={i.id} /><input type="hidden" name="situacao" value={i.situacao === 'disponivel' ? 'retirado' : 'disponivel'} /><button className="sec">{i.situacao === 'disponivel' ? 'Retirar' : 'Disponibilizar'}</button></form>
          <form action={acaoNovaVersao} style={{ marginTop: 6 }}><input type="hidden" name="empresaId" value={id} /><input type="hidden" name="id" value={i.id} /><input type="file" name="arquivo" required accept=".pdf,.xlsx,.jpg,.png" /><button className="sec">Enviar nova versão</button></form></td></tr>); })}
      {!informes.length && <tr><td colSpan={7} className="soon">Nenhum informe cadastrado.</td></tr>}</tbody></table></div></div>

    <div className="card"><h2>Tipos de documento (valem para todas as empresas)</h2>
      <div className="row">{tipos.map((t) => <form key={t.id} action={acaoAtivarTipo}><input type="hidden" name="empresaId" value={id} /><input type="hidden" name="id" value={t.id} /><input type="hidden" name="ativo" value={String(!t.ativo)} /><span className={`tag ${t.ativo ? '' : 'off'}`}>{t.nome} <button className="sec" style={{ padding: '0 6px' }} title={t.ativo ? 'Desativar' : 'Reativar'}>{t.ativo ? '×' : '↺'}</button></span></form>)}</div>
      <form action={acaoCriarTipo} className="row"><input type="hidden" name="empresaId" value={id} /><div style={{ flex: 1 }}><label>Novo tipo</label><input name="nome" required /></div><button>Criar tipo</button></form></div>
  </main></>);
}
