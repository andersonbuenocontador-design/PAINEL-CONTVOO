import Link from 'next/link';
import { ArrowRight, Banknote, ClipboardList, Landmark, ListTree, MessagesSquare, Settings2, Users } from 'lucide-react';
import { notFound } from 'next/navigation';
import { exigirUsuario } from '@/lib/session';
import { obterEmpresa, usuariosDaEmpresa } from '@/lib/services/empresas';
import { situacaoCompetencia } from '@/lib/services/documentos';
import { obterStatusConciliacao } from '@/lib/services/conciliacao';
import { resumoPendencias } from '@/lib/services/pendencias';
import { compararRetiradas } from '@/lib/services/lucros';
import { query } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { formatarCnpj } from '@/lib/cnpj';
import { Avisos, CompetenciaSeletor, Topo, competenciaDe } from '../../../components';
import { acaoEditarEmpresa, acaoSituacaoEmpresa, acaoVincular, acaoCriarUsuario } from '../../actions';

const CONC = { revisao: ['Cliente preenchendo', 'neutro'], enviada: ['Aguardando sua conferência', 'conferir'], devolvida: ['Devolvida ao cliente', 'falta'], concluida: ['Concluída', 'ok'] } as const;
const LUCROS = { atencao: ['Atenção', 'falta'], aguardando_extrato: ['Aguardando extrato', 'conferir'], ok: ['Tudo confere', 'ok'], sem_movimento: ['Sem movimento', 'neutro'] } as const;
const fone = (w: string) => { const d = w.replace(/^55/, ''); return d.length >= 10 ? `(${d.slice(0, 2)}) ${d.slice(2, -4)}-${d.slice(-4)}` : w; };
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const brl = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Painel da empresa: tudo do mês num lugar só (documentos, conciliação, lucros, pendências), acessos e dados cadastrais recolhidos. */
export default async function EmpresaDetalhe({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ erro?: string; ok?: string; competencia?: string }> }) {
  const u = await exigirUsuario('admin');
  const { id } = await params; const sp = await searchParams; const comp = competenciaDe(sp.competencia); const c = `?competencia=${comp}`;
  let e; try { e = await obterEmpresa(u, id); } catch (x) { if (x instanceof AppError) notFound(); throw x; }
  const [admins, vinculados, clientes, docs, conc, pend, lucros, movs, novos] = await Promise.all([
    query(`SELECT id,nome FROM usuarios WHERE papel='admin' AND ativo ORDER BY nome`),
    usuariosDaEmpresa(u, id),
    query(`SELECT id,nome,email FROM usuarios WHERE papel='cliente' AND ativo AND id NOT IN (SELECT usuario_id FROM usuario_empresas WHERE empresa_id=$1) ORDER BY nome`, [id]),
    situacaoCompetencia(u, id, comp), obterStatusConciliacao(u, id, comp), resumoPendencias(u, id), compararRetiradas(u, id, comp),
    query(`SELECT count(*)::int n, count(*) FILTER (WHERE NOT revisado AND confianca<>'A')::int revisar FROM movimentacoes WHERE empresa_id=$1 AND competencia=$2`, [id, comp]),
    query(`SELECT count(*)::int n FROM documentos_avulsos WHERE empresa_id=$1 AND visto_em IS NULL AND removido_em IS NULL AND descartado_em IS NULL`, [id]),
  ]);
  const voltar = `/admin/empresas/${id}`; const ind = docs.indicadores; const aConferir = ind.enviados - ind.aprovados - ind.rejeitados;
  const m = movs.rows[0] as { n: number; revisar: number }; const nNovos = novos.rows[0].n as number;
  const responsavel = admins.rows.find((a) => a.id === e.responsavel_id)?.nome as string | undefined;
  const [concTxt, concCls] = CONC[conc]; const [lucTxt, lucCls] = LUCROS[lucros.status];
  const zap = e.whatsapp ? fone(e.whatsapp) : null;
  const fazer = [
    aConferir > 0 && { href: `/admin/empresas/${id}/documentos${c}`, n: aConferir, txt: aConferir === 1 ? 'documento para conferir' : 'documentos para conferir', tom: 'azul' },
    nNovos > 0 && { href: `/admin/empresas/${id}/documentos${c}#outros`, n: nNovos, txt: nNovos === 1 ? 'arquivo novo do cliente' : 'arquivos novos do cliente', tom: 'azul' },
    conc === 'enviada' && { href: `/admin/empresas/${id}/extratos${c}`, n: null, txt: 'Conciliação aguardando sua conferência', tom: 'azul' },
    lucros.resumo.esquecidas > 0 && { href: `/admin/lucros/${id}${c}`, n: lucros.resumo.esquecidas, txt: lucros.resumo.esquecidas === 1 ? 'retirada que o cliente pode ter esquecido' : 'retiradas que o cliente pode ter esquecido', tom: 'laranja' },
    ind.pendentes + ind.rejeitados > 0 && { href: `/admin/entregas${c}`, n: ind.pendentes + ind.rejeitados, txt: ind.pendentes + ind.rejeitados === 1 ? 'documento que o cliente ainda deve' : 'documentos que o cliente ainda deve', tom: 'laranja' },
    pend.vencidas > 0 && { href: `/admin/empresas/${id}/pendencias`, n: pend.vencidas, txt: pend.vencidas === 1 ? 'pendência vencida' : 'pendências vencidas', tom: 'laranja' },
  ].filter(Boolean) as { href: string; n: number | null; txt: string; tom: string }[];
  return (<><Topo u={u} /><main className="inicio emp">
    <p className="emp-voltar"><Link href={`/admin/entregas${c}`}>← Entregas do mês</Link></p>
    <section className="inicio-ola">
      <div><h1>{e.razao_social} <span className={`emp-situacao ${e.situacao}`}>{e.situacao === 'ativa' ? 'Ativa' : 'Inativa'}</span></h1>
        <p className="inicio-sub">CNPJ {formatarCnpj(e.cnpj)}{zap ? ` · WhatsApp ${zap}` : ''}{e.nome_fantasia && e.nome_fantasia !== e.razao_social ? ` · ${e.nome_fantasia}` : ''}</p></div>
      <CompetenciaSeletor atual={comp} mini />
    </section>
    <Avisos erro={sp.erro} ok={sp.ok} />

    <section className="inicio-atencao" aria-label="O que pede atenção nesta empresa">
      {fazer.length ? <><h2>Para fazer agora</h2><div className="inicio-chips">{fazer.map((a) => (
        <Link key={a.txt} href={a.href} className={`inicio-chip ${a.tom}`}>{a.n != null && <strong>{a.n}</strong>} {a.txt} <ArrowRight size={14} /></Link>))}</div></>
        : <p className="inicio-tudo-certo">✓ Tudo em dia com esta empresa neste mês.</p>}
    </section>

    <h2 className="inicio-secao">Mês de {MESES[Number(comp.slice(5)) - 1]}</h2>
    <section className="inicio-grandes">
      <Link href={`/admin/empresas/${id}/documentos${c}`} className="inicio-cartao">
        <span className="ic laranja"><ClipboardList size={22} /></span>
        <div className="corpo"><strong>Documentos do mês</strong>
          {ind.exigidos ? <><div className="barra"><div style={{ width: `${ind.percentual}%` }} /></div>
            <span className="num">{ind.concluida ? 'Tudo aprovado ✓' : `${ind.aprovados} de ${ind.exigidos} aprovados`}{ind.pendentes ? <b className="alerta"> · falta {ind.pendentes}</b> : ''}{ind.rejeitados ? <b className="alerta"> · {ind.rejeitados} recusado{ind.rejeitados > 1 ? 's' : ''}</b> : ''}</span></>
            : <span className="num">Nenhum documento pedido · <u>configurar</u></span>}</div>
      </Link>
      <Link href={`/admin/empresas/${id}/extratos${c}`} className="inicio-cartao">
        <span className="ic azul"><Landmark size={22} /></span>
        <div className="corpo"><strong>Conciliação</strong>
          <span className="num">{m.n ? <>{conc === 'enviada' ? <b className="alerta">{concTxt}</b> : concTxt} · {m.n} lançamento{m.n > 1 ? 's' : ''}{m.revisar ? ` · ${m.revisar} para revisar` : ''}</> : 'Nenhum extrato no mês'}</span></div>
      </Link>
      <Link href={`/admin/lucros/${id}${c}`} className="inicio-cartao">
        <span className="ic verde"><Banknote size={22} /></span>
        <div className="corpo"><strong>Lucros dos sócios</strong>
          <span className="num">{lucros.status === 'atencao' ? <b className="alerta">{lucTxt}</b> : lucTxt}{lucros.resumo.informadas ? ` · ${brl(lucros.resumo.totalInformado)} informado` : lucros.envio?.sem_retiradas ? ' · sem retiradas' : ''}{lucros.acimaDoLimite.length ? <b className="alerta"> · acima de R$ 50 mil</b> : ''}</span></div>
      </Link>
      <Link href={`/admin/empresas/${id}/pendencias`} className="inicio-cartao">
        <span className="ic roxo"><MessagesSquare size={22} /></span>
        <div className="corpo"><strong>Pendências</strong>
          <span className="num">{pend.abertas ? <>{pend.abertas} em aberto · {pend.aguardando} aguardando o cliente{pend.vencidas ? <b className="alerta"> · {pend.vencidas} vencida{pend.vencidas > 1 ? 's' : ''}</b> : ''}</> : 'Nenhuma pendência ✓'}</span></div>
      </Link>
    </section>

    <h2 className="inicio-secao">Cadastro</h2>
    <section className="inicio-pequenos" style={{ marginBottom: 14 }}>
      <Link href={`/admin/empresas/${id}/informes${c}`} className="inicio-mini"><Users size={18} /><span><strong>Sócios e retiradas</strong><small>Sócios com CPF e retiradas informadas</small></span></Link>
      <Link href={`/admin/empresas/${id}/plano`} className="inicio-mini"><ListTree size={18} /><span><strong>Plano de contas</strong><small>Categorias da conciliação</small></span></Link>
      <Link href={`/admin/empresas/${id}/documentos${c}`} className="inicio-mini"><Settings2 size={18} /><span><strong>Documentos pedidos</strong><small>O que o cliente envia todo mês</small></span></Link>
    </section>
    <div className="emp-colunas">
      <section className="card emp-bloco"><h2>Quem acessa <span className="soon">({vinculados.length})</span></h2>
        <ul className="emp-usuarios">{vinculados.map((v) => (<li key={v.id}><span className="emp-avatar" aria-hidden="true">{(v.nome.match(/[A-Za-zÀ-ÿ]/)?.[0] ?? '?').toUpperCase()}</span>
          <div><strong>{v.nome}</strong>{!v.ativo && <span className="ent-chip neutro" style={{ marginLeft: 6 }}>bloqueado</span>}<div className="soon">{v.email}</div></div>
          <form action={acaoVincular}><input type="hidden" name="usuarioId" value={v.id} /><input type="hidden" name="empresaId" value={id} /><input type="hidden" name="modo" value="desvincular" /><input type="hidden" name="voltar" value={voltar} /><button className="link-perigo">Remover</button></form></li>))}
          {!vinculados.length && <li className="soon">Ninguém acessa esta empresa ainda.</li>}</ul>
        <details className="emp-abrir"><summary>+ Dar acesso a alguém</summary>
          <form action={acaoCriarUsuario} className="emp-form"><input type="hidden" name="papel" value="cliente" /><input type="hidden" name="empresaIds" value={id} /><input type="hidden" name="voltar" value={voltar} />
            <p className="emp-sub">Novo usuário</p>
            <div className="grid"><div><label>Nome *</label><input name="nome" required /></div><div><label>E-mail *</label><input name="email" type="email" required /></div>
              <div><label>Senha temporária * (mín. 10)</label><input name="senha" type="text" minLength={10} required autoComplete="off" /></div></div>
            <p className="soon">Ele troca a senha no primeiro acesso.</p><button>Criar usuário</button></form>
          {clientes.rows.length > 0 && <form action={acaoVincular} className="emp-form"><input type="hidden" name="empresaId" value={id} /><input type="hidden" name="modo" value="vincular" /><input type="hidden" name="voltar" value={voltar} />
            <p className="emp-sub">Ou um usuário que já existe</p>
            <div className="row"><select name="usuarioId" aria-label="Usuário existente" style={{ flex: 1 }}>{clientes.rows.map((cl) => <option key={cl.id} value={cl.id}>{cl.nome} ({cl.email})</option>)}</select><button className="sec">Vincular</button></div></form>}
        </details>
      </section>

      <section className="card emp-bloco"><h2>Dados da empresa</h2>
        <dl className="emp-dados">
          <div><dt>Razão social</dt><dd>{e.razao_social}</dd></div>
          <div><dt>CNPJ</dt><dd>{formatarCnpj(e.cnpj)}</dd></div>
          {e.nome_fantasia && e.nome_fantasia !== e.razao_social && <div><dt>Nome fantasia</dt><dd>{e.nome_fantasia}</dd></div>}
          <div><dt>E-mail de contato</dt><dd>{e.email_contato || <span className="soon">—</span>}</dd></div>
          <div><dt>WhatsApp</dt><dd>{e.whatsapp ? fone(e.whatsapp) : <span className="soon">— (cadastre para a cobrança pelo Digisac)</span>}</dd></div>
          <div><dt>Responsável</dt><dd>{responsavel || <span className="soon">—</span>}</dd></div>
          <div><dt>Início de uso</dt><dd>{e.inicio_uso ? new Date(e.inicio_uso).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : <span className="soon">—</span>}</dd></div>
        </dl>
        <details className="emp-abrir"><summary>Editar dados</summary>
          <form action={acaoEditarEmpresa} className="emp-form"><input type="hidden" name="id" value={id} /><div className="grid">
            <div><label>Razão social *</label><input name="razaoSocial" defaultValue={e.razao_social} required /></div>
            <div><label>Nome fantasia</label><input name="nomeFantasia" defaultValue={e.nome_fantasia ?? ''} /></div>
            <div><label>CNPJ *</label><input name="cnpj" defaultValue={e.cnpj} required /></div>
            <div><label>E-mail de contato</label><input name="emailContato" type="email" defaultValue={e.email_contato ?? ''} /></div>
            <div><label>WhatsApp do cliente</label><input name="whatsapp" inputMode="tel" placeholder="(51) 99999-9999" defaultValue={e.whatsapp ?? ''} /></div>
            <div><label>Responsável</label><select name="responsavelId" defaultValue={e.responsavel_id ?? ''}><option value="">—</option>{admins.rows.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}</select></div>
            <div><label>Início de uso</label><input name="inicioUso" type="date" defaultValue={e.inicio_uso ? new Date(e.inicio_uso).toISOString().slice(0, 10) : ''} /></div>
          </div><button>Salvar alterações</button></form>
          <form action={acaoSituacaoEmpresa} className="emp-desativar"><input type="hidden" name="id" value={id} /><input type="hidden" name="situacao" value={e.situacao === 'ativa' ? 'inativa' : 'ativa'} />
            <button className={e.situacao === 'ativa' ? 'link-perigo' : 'sec'}>{e.situacao === 'ativa' ? 'Desativar empresa' : 'Reativar empresa'}</button>
            <span className="soon">Desativar não apaga documentos nem histórico.</span></form>
        </details>
      </section>
    </div>
  </main></>);
}
