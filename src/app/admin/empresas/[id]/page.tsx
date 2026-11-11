import Link from 'next/link';
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
  return (<><Topo u={u} /><main className="emp">
    <p className="emp-voltar"><Link href={`/admin/entregas${c}`}>← Entregas do mês</Link></p>
    <header className="emp-cabeca">
      <div><h1>{e.razao_social} <span className={`emp-situacao ${e.situacao}`}>{e.situacao === 'ativa' ? 'Ativa' : 'Inativa'}</span></h1>
        <p className="emp-meta">CNPJ {formatarCnpj(e.cnpj)}{e.nome_fantasia && e.nome_fantasia !== e.razao_social ? ` · ${e.nome_fantasia}` : ''}{e.email_contato ? ` · ${e.email_contato}` : ''}{responsavel ? ` · Responsável: ${responsavel}` : ''}</p></div>
      <CompetenciaSeletor atual={comp} mini />
    </header>
    <Avisos erro={sp.erro} ok={sp.ok} />

    <section className="emp-cartoes" aria-label="Situação do mês">
      <article className="emp-cartao">
        <header><h2>Documentos do mês</h2>{ind.exigidos ? (ind.concluida ? <span className="ent-chip ok">Concluída</span> : null) : <span className="ent-chip neutro">Nada pedido</span>}</header>
        {ind.exigidos > 0 && <><div className="ent-barra"><div style={{ width: `${ind.percentual}%` }} /></div><p className="emp-num">{ind.aprovados} de {ind.exigidos} aprovados</p></>}
        <div className="ent-chips">{ind.pendentes > 0 && <span className="ent-chip falta">Falta {ind.pendentes}</span>}{ind.rejeitados > 0 && <span className="ent-chip recusado">{ind.rejeitados} recusado{ind.rejeitados > 1 ? 's' : ''}</span>}
          {aConferir > 0 && <span className="ent-chip conferir">{aConferir} para conferir</span>}{nNovos > 0 && <span className="ent-chip conferir">{nNovos} arquivo{nNovos > 1 ? 's' : ''} novo{nNovos > 1 ? 's' : ''}</span>}</div>
        <Link className={`ent-btn ${aConferir || nNovos ? 'principal' : ''}`} href={`/admin/empresas/${id}/documentos${c}`}>{aConferir ? 'Conferir documentos' : 'Abrir documentos'}</Link>
      </article>
      <article className="emp-cartao">
        <header><h2>Conciliação</h2><span className={`ent-chip ${concCls}`}>{m.n ? concTxt : 'Sem extrato'}</span></header>
        <p className="emp-num">{m.n ? `${m.n} lançamento${m.n > 1 ? 's' : ''}` : 'Nenhum extrato importado no mês'}</p>
        {m.revisar > 0 && <div className="ent-chips"><span className="ent-chip falta">{m.revisar} para revisar</span></div>}
        <Link className={`ent-btn ${conc === 'enviada' ? 'principal' : ''}`} href={`/admin/empresas/${id}/extratos${c}`}>{conc === 'enviada' ? 'Conferir conciliação' : 'Abrir conciliação'}</Link>
      </article>
      <article className="emp-cartao">
        <header><h2>Lucros dos sócios</h2><span className={`ent-chip ${lucCls}`}>{lucTxt}</span></header>
        <p className="emp-num">{lucros.resumo.informadas ? `${brl(lucros.resumo.totalInformado)} informado${lucros.envio ? '' : ' (não enviado)'}` : lucros.envio?.sem_retiradas ? 'Cliente informou: sem retiradas' : 'Nada informado'}</p>
        <div className="ent-chips">{lucros.resumo.esquecidas > 0 && <span className="ent-chip falta">{lucros.resumo.esquecidas} possível(is) esquecida(s)</span>}
          {lucros.resumo.naoEncontradas + lucros.resumo.divergentes > 0 && <span className="ent-chip recusado">{lucros.resumo.naoEncontradas + lucros.resumo.divergentes} não bate(m)</span>}
          {lucros.acimaDoLimite.length > 0 && <span className="ent-chip recusado">acima de R$ 50 mil</span>}</div>
        <div className="emp-links"><Link className={`ent-btn ${lucros.status === 'atencao' ? 'principal' : ''}`} href={`/admin/lucros/${id}${c}`}>Comparar com o extrato</Link>
          <Link className="emp-link" href={`/admin/empresas/${id}/informes${c}`}>Sócios e retiradas</Link></div>
      </article>
      <article className="emp-cartao">
        <header><h2>Pendências</h2>{pend.abertas ? <span className={`ent-chip ${pend.vencidas ? 'recusado' : 'conferir'}`}>{pend.abertas} em aberto</span> : <span className="ent-chip ok">Nenhuma</span>}</header>
        <p className="emp-num">{pend.abertas ? `${pend.aguardando} aguardando o cliente${pend.vencidas ? ` · ${pend.vencidas} vencida${pend.vencidas > 1 ? 's' : ''}` : ''}` : 'Nada aguardando'}</p>
        <Link className="ent-btn" href={`/admin/empresas/${id}/pendencias`}>Abrir pendências</Link>
      </article>
    </section>

    <div className="emp-colunas">
      <section className="card emp-bloco"><h2>Quem acessa <span className="soon">({vinculados.length})</span></h2>
        <ul className="emp-usuarios">{vinculados.map((v) => (<li key={v.id}><span className="emp-avatar" aria-hidden="true">{v.nome.trim().charAt(0).toUpperCase()}</span>
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
          {e.nome_fantasia && <div><dt>Nome fantasia</dt><dd>{e.nome_fantasia}</dd></div>}
          <div><dt>E-mail de contato</dt><dd>{e.email_contato || <span className="soon">—</span>}</dd></div>
          <div><dt>Responsável</dt><dd>{responsavel || <span className="soon">—</span>}</dd></div>
          <div><dt>Início de uso</dt><dd>{e.inicio_uso ? new Date(e.inicio_uso).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : <span className="soon">—</span>}</dd></div>
        </dl>
        <details className="emp-abrir"><summary>Editar dados</summary>
          <form action={acaoEditarEmpresa} className="emp-form"><input type="hidden" name="id" value={id} /><div className="grid">
            <div><label>Razão social *</label><input name="razaoSocial" defaultValue={e.razao_social} required /></div>
            <div><label>Nome fantasia</label><input name="nomeFantasia" defaultValue={e.nome_fantasia ?? ''} /></div>
            <div><label>CNPJ *</label><input name="cnpj" defaultValue={e.cnpj} required /></div>
            <div><label>E-mail de contato</label><input name="emailContato" type="email" defaultValue={e.email_contato ?? ''} /></div>
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
