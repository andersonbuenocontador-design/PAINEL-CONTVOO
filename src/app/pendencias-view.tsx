import { notFound } from 'next/navigation';
import type { UsuarioSessao } from '@/lib/services/usuarios';
import { obterEmpresa } from '@/lib/services/empresas';
import { CATEGORIAS, listarPendencias, mensagensDaPendencia } from '@/lib/services/pendencias';
import { query } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { Avisos, Topo, competenciaDe } from './components';
import { acaoCancelarPendencia, acaoCriarPendencia, acaoReabrirPendencia, acaoResolverPendencia, acaoResponderPendencia } from './pendencias-actions';

const SIT = { aberta: 'Aguardando o cliente', respondida: 'Aguardando o escritório', resolvida: 'Resolvida', cancelada: 'Cancelada' } as const;
const dt = (d: string | Date) => new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
const dm = (iso: string) => iso.split('-').reverse().join('/');

export async function PendenciasPagina({ u, empresaId, sp, voltar }: { u: UsuarioSessao; empresaId: string; sp: { erro?: string; ok?: string }; voltar: string }) {
  let e, lista; try { e = await obterEmpresa(u, empresaId); lista = await listarPendencias(u, empresaId); } catch (x) { if (x instanceof AppError) notFound(); throw x; }
  const admin = u.papel === 'admin';
  const msgs = new Map(await Promise.all(lista.map(async (p) => [p.id, await mensagensDaPendencia(u, p.id)] as const)));
  const admins = admin ? (await query(`SELECT id,nome FROM usuarios WHERE papel='admin' AND ativo ORDER BY nome`)).rows : [];
  const ativas = lista.filter((p) => p.situacao === 'aberta' || p.situacao === 'respondida'); const encerradas = lista.filter((p) => !ativas.includes(p));
  const bloco = (p: (typeof lista)[number]) => (
    <details key={p.id} open={p.situacao === 'aberta' && !admin ? true : undefined} style={{ borderBottom: '1px solid var(--bd)', padding: '10px 0' }}>
      <summary><strong>{CATEGORIAS[p.categoria]}</strong>{p.competencia && ` · ${p.competencia.slice(5)}/${p.competencia.slice(0, 4)}`} — {p.descricao.slice(0, 90)}{p.descricao.length > 90 ? '…' : ''}
        {' '}<span className={`tag ${p.situacao === 'aberta' || p.situacao === 'respondida' ? '' : 'off'}`}>{SIT[p.situacao]}</span>
        {p.prazo && <span className={`tag ${p.vencida ? '' : 'off'}`} style={p.vencida ? { background: '#fef3f2', color: 'var(--err)' } : undefined}> prazo {dm(p.prazo)}{p.vencida ? ' (vencido)' : ''}</span>}</summary>
      <div style={{ margin: '10px 0' }}>{msgs.get(p.id)!.map((m) => (<div key={m.id} style={{ padding: '6px 10px', margin: '6px 0', borderRadius: 8, background: m.papel === 'admin' ? '#eef2ff' : '#f2f4f7' }}>
        <div className="soon">{m.papel === 'admin' ? `Escritório · ${m.nome}` : `Cliente · ${m.nome}`} · {dt(m.criado_em)}</div><div style={{ whiteSpace: 'pre-wrap' }}>{m.texto}</div></div>))}</div>
      {admin && p.responsavel && <p className="soon">Responsável no escritório: {p.responsavel}</p>}
      {(p.situacao === 'aberta' || p.situacao === 'respondida') && (<form action={acaoResponderPendencia}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="empresaId" value={empresaId} />
        <label>{admin ? 'Responder ao cliente' : 'Sua resposta'}</label><textarea name="texto" rows={3} required maxLength={2000} style={{ width: '100%' }} /><p><button>Enviar resposta</button></p></form>)}
      {admin && (<div className="row">
        {(p.situacao === 'aberta' || p.situacao === 'respondida') && <><form action={acaoResolverPendencia}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="empresaId" value={empresaId} /><button>Marcar como resolvida</button></form>
          <form action={acaoCancelarPendencia}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="empresaId" value={empresaId} /><button className="sec">Cancelar solicitação</button></form></>}
        {(p.situacao === 'resolvida' || p.situacao === 'cancelada') && <form action={acaoReabrirPendencia}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="empresaId" value={empresaId} /><button className="sec">Reabrir</button></form>}</div>)}
    </details>);
  return (<><Topo u={u} /><main><p><a href={voltar}>← {admin ? 'Empresa' : e.razao_social}</a></p>
    <h1>{admin ? `Pendências — ${e.razao_social}` : 'Pendências do escritório'}</h1><Avisos erro={sp.erro} ok={sp.ok} />
    {admin && (<div className="card"><h2>Nova solicitação ao cliente</h2><form action={acaoCriarPendencia}><input type="hidden" name="empresaId" value={empresaId} /><div className="grid">
      <div><label>Categoria *</label><select name="categoria">{Object.entries(CATEGORIAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
      <div><label>Competência (opcional)</label><input name="competencia" type="month" defaultValue={competenciaDe()} /></div>
      <div><label>Prazo (opcional)</label><input name="prazo" type="date" /></div>
      <div><label>Responsável no escritório</label><select name="responsavelId"><option value="">Padrão da empresa</option>{admins.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}</select></div></div>
      <label>O que o cliente precisa fazer? *</label><textarea name="descricao" rows={3} required maxLength={2000} style={{ width: '100%' }} placeholder="Ex.: Envie o extrato do Banrisul de outubro." />
      <p><button>Enviar solicitação</button></p></form></div>)}
    <div className="card"><h2>Em andamento ({ativas.length})</h2>{ativas.map(bloco)}{!ativas.length && <p className="soon">{admin ? 'Nenhuma solicitação em andamento.' : 'Você não tem solicitações pendentes. 🎉'}</p>}</div>
    {encerradas.length > 0 && <div className="card"><h2>Encerradas ({encerradas.length})</h2>{encerradas.map(bloco)}</div>}
  </main></>);
}
