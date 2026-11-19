import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Check, ChevronRight, Eye, History, Plus, X } from 'lucide-react';
import { exigirUsuario } from '@/lib/session';
import { obterEmpresa } from '@/lib/services/empresas';
import { listarAvulsos, listarExigencias, situacaoCompetencia, historicoVersoes } from '@/lib/services/documentos';
import { AppError } from '@/lib/errors';
import { Avisos, CompetenciaSeletor, ROTULO, Topo, competenciaDe } from '../../../../components';
import { CamposExigencia } from '../../../FormExigencia';
import { MarcaDoc } from '../../../../MarcaDoc';
import { AnexarEscritorio } from '../../../AnexarEscritorio';
import { AtalhosBancos } from '../../../AtalhosBancos';
import { acaoAtivarExigencia, acaoConferir, acaoCriarExigencia, acaoEditarExigencia, acaoRemoverAvulsoAdmin } from '../../../docs-actions';

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const quando = (d: Date | string) => new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const ST: Record<string, string> = { pendente: 'falta', enviado: 'conferir', em_conferencia: 'conferir', aprovado: 'ok', rejeitado: 'recusado' };

/** Documentos pedidos à empresa: cartões com a marca do banco, situação colorida e as ações de conferência. */
export default async function DocsEmpresa({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ competencia?: string; erro?: string; ok?: string }> }) {
  const u = await exigirUsuario('admin'); const { id } = await params; const sp = await searchParams; const comp = competenciaDe(sp.competencia);
  let e; try { e = await obterEmpresa(u, id); } catch (x) { if (x instanceof AppError) notFound(); throw x; }
  const [exigencias, s, avulsos] = await Promise.all([listarExigencias(u, id), situacaoCompetencia(u, id, comp), listarAvulsos(u, id, comp)]);
  const hist = new Map(await Promise.all(s.itens.filter((i) => i.arquivo_id).map(async (i) => [i.exigencia_id, await historicoVersoes(u, id, i.exigencia_id, comp)] as const)));
  const ind = s.indicadores; const [ano, mes] = comp.split('-'); const aConferir = ind.enviados - ind.aprovados - ind.rejeitados;
  const oc = (arquivoId: string) => (<><input type="hidden" name="empresaId" value={id} /><input type="hidden" name="competencia" value={comp} /><input type="hidden" name="arquivoId" value={arquivoId} /></>);
  const novos = avulsos.filter((d) => !d.visto_em && !d.descartado_em).length;
  return (<><Topo u={u} /><main className="inicio doc2">
    <p className="emp-voltar"><Link href={`/admin/empresas/${id}?competencia=${comp}`}>← {e.razao_social}</Link></p>
    <section className="inicio-ola">
      <div><h1>Documentos do mês</h1><p className="inicio-sub">{e.razao_social} · <strong>{MESES[Number(mes) - 1]} de {ano}</strong></p></div>
      <CompetenciaSeletor atual={comp} mini />
    </section>
    <Avisos erro={sp.erro} ok={sp.ok} />

    <section className="doc2-resumo">
      <div className="doc2-anel" style={{ ['--p' as string]: `${ind.percentual * 3.6}deg` }}><span>{ind.percentual}%</span><small>aprovado</small></div>
      <div className="doc2-numeros">
        <div><strong>{ind.exigidos}</strong><span>pedidos</span></div>
        <div className="azul"><strong>{aConferir}</strong><span>para conferir</span></div>
        <div className="verde"><strong>{ind.aprovados}</strong><span>aprovados</span></div>
        <div className="laranja"><strong>{ind.pendentes}</strong><span>faltam</span></div>
        <div className="vermelho"><strong>{ind.rejeitados}</strong><span>recusados</span></div>
      </div>
      <a href="#pedir" className="doc2-btn primario"><Plus size={16} /> Pedir documento</a>
    </section>

    <section className="doc2-lista">
      {s.itens.map((i) => { const h = hist.get(i.exigencia_id) ?? []; const atual = h[0]; const antigas = h.slice(1); return (
        <article key={i.exigencia_id} className={`doc2-card st-${ST[i.situacao] ?? 'falta'}`}>
          <header>
            <MarcaDoc nome={i.nome} instituicao={i.instituicao} />
            <div className="doc2-titulo"><strong>{i.nome}</strong><span>{[i.instituicao, !i.obrigatorio && 'opcional'].filter(Boolean).join(' · ') || 'Documento mensal'}</span></div>
            <span className={`doc2-status ${ST[i.situacao] ?? 'falta'}`}>{i.situacao === 'pendente' ? 'Falta enviar' : ROTULO[i.situacao]}</span>
          </header>
          {atual ? <div className="doc2-arquivo">
            <a href={`/api/arquivos/${atual.id}`} className="doc2-link"><Eye size={14} /> {atual.nome_original}</a>
            <span className="soon">v{atual.versao} · {atual.enviado_por} · {quando(atual.enviado_em)}</span>
            {i.situacao === 'rejeitado' && atual.motivo_rejeicao && <div className="doc2-motivo">Recusado: {atual.motivo_rejeicao}</div>}
            {antigas.length > 0 && <details className="doc2-hist"><summary><History size={13} /> {antigas.length} versão(ões) anterior(es)</summary>
              {antigas.map((v) => <div key={v.id} className="soon">v{v.versao} · <a href={`/api/arquivos/${v.id}`}>{v.nome_original}</a> · {v.enviado_por} · {quando(v.enviado_em)} · {ROTULO[v.situacao]}{v.motivo_rejeicao ? ` (${v.motivo_rejeicao})` : ''}</div>)}</details>}
          </div> : <p className="doc2-vazio">O cliente ainda não enviou{i.dia_prazo ? ` · prazo dia ${i.dia_prazo}` : ''}.</p>}
          <footer>
            {i.arquivo_id && i.situacao !== 'aprovado' && <form action={acaoConferir}>{oc(i.arquivo_id)}<input type="hidden" name="decisao" value="aprovado" /><button className="doc2-btn verde"><Check size={15} /> Aprovar</button></form>}
            {i.arquivo_id && i.situacao === 'enviado' && <form action={acaoConferir}>{oc(i.arquivo_id)}<input type="hidden" name="decisao" value="em_conferencia" /><button className="doc2-btn leve">Em conferência</button></form>}
            {i.arquivo_id && i.situacao !== 'rejeitado' && i.situacao !== 'aprovado' && <details className="doc2-pop"><summary className="doc2-btn vermelho-leve"><X size={15} /> Recusar</summary>
              <form action={acaoConferir} className="doc2-pop-corpo">{oc(i.arquivo_id)}<input type="hidden" name="decisao" value="rejeitado" /><input name="motivo" required placeholder="Motivo (o cliente vê)" /><button className="doc2-btn vermelho">Recusar</button></form></details>}
            {i.arquivo_id && i.situacao === 'aprovado' && <details className="doc2-pop corrigir-aprovado"><summary className="doc2-btn leve">Corrigir aprovação</summary>
              <div className="doc2-pop-corpo largo"><p className="soon">Aprovou por engano (ex.: período errado)? Desfaça; o histórico fica na auditoria.</p>
                <form action={acaoConferir} className="grade">{oc(i.arquivo_id)}<input type="hidden" name="decisao" value="rejeitado" /><input name="motivo" required placeholder={`Ex.: período errado, envie o de ${mes}/${ano}`} />
                  <label className="soon"><input type="checkbox" name="retirarLancamentos" /> Se for extrato, retirar da conciliação os lançamentos dele</label><button className="doc2-btn vermelho">Desfazer aprovação e recusar</button></form>
                <form action={acaoConferir}>{oc(i.arquivo_id)}<input type="hidden" name="decisao" value="em_conferencia" /><button className="doc2-btn leve">Voltar para “em conferência”</button></form></div></details>}
            <AnexarEscritorio empresaId={id} competencia={comp} exigenciaId={i.exigencia_id} />
          </footer>
        </article>); })}
      {!s.itens.length && <div className="card doc2-sem"><p>Nenhum documento pedido nesta competência.</p><a href="#pedir" className="doc2-btn primario"><Plus size={16} /> Pedir o primeiro documento</a></div>}
    </section>

    <section className="card doc2-bloco" id="outros"><h2>Outros arquivos enviados pelo cliente <span className="soon">({avulsos.length})</span>{novos > 0 && <span className="doc2-status conferir" style={{ marginLeft: 8 }}>{novos} novo{novos > 1 ? 's' : ''}</span>}</h2>
      {avulsos.length ? <ul className="doc2-avulsos">{avulsos.map((d) => (<li key={d.id}>
        <MarcaDoc nome={`${d.nome_original} ${d.descricao ?? ''}`} tamanho={34} />
        <div className="doc2-titulo">{d.descartado_em ? <span className="soon">{d.nome_original} (descartado)</span> : <a href={`/api/avulsos/${d.id}`}>{d.nome_original}</a>}
          <span>{d.descricao ? `${d.descricao} · ` : ''}{d.enviado_por} · {quando(d.enviado_em)}</span></div>
        {!d.visto_em && !d.descartado_em && <span className="doc2-status conferir">Novo</span>}
        <form action={acaoRemoverAvulsoAdmin}><input type="hidden" name="empresaId" value={id} /><input type="hidden" name="competencia" value={comp} /><input type="hidden" name="id" value={d.id} /><button className="link-perigo">Retirar</button></form>
      </li>))}</ul> : <p className="soon">Nenhum outro arquivo nesta competência.</p>}
    </section>

    <section className="card doc2-bloco" id="pedir"><h2>Pedir documento</h2>
      <p className="soon">O que esta empresa precisa enviar todo mês. Para extrato, clique no banco e o formulário se preenche sozinho.</p>
      <form action={acaoCriarExigencia} className="doc2-form"><input type="hidden" name="empresaId" value={id} /><AtalhosBancos /><CamposExigencia /><p><button className="doc2-btn primario"><Plus size={16} /> Adicionar documento</button></p></form>
    </section>

    <section className="card doc2-bloco"><h2>Documentos pedidos desta empresa <span className="soon">({exigencias.length})</span></h2>
      <ul className="doc2-config">{exigencias.map((x) => (<li key={x.id}><details>
        <summary><MarcaDoc nome={x.nome} instituicao={x.instituicao} categoria={x.categoria} tamanho={34} />
          <span className="doc2-titulo"><strong>{x.nome}</strong><span>{[x.instituicao, x.frequencia, x.formatos.join('/').toUpperCase(), !x.obrigatorio && 'opcional'].filter(Boolean).join(' · ')}</span></span>
          {!x.ativo && <span className="doc2-status neutro">inativo</span>}<ChevronRight size={16} className="doc2-seta" /></summary>
        <div className="doc2-config-corpo">
          <form action={acaoEditarExigencia}><input type="hidden" name="id" value={x.id} /><input type="hidden" name="empresaId" value={id} /><CamposExigencia e={x} /><p><button className="doc2-btn primario">Salvar alterações</button></p></form>
          <form action={acaoAtivarExigencia}><input type="hidden" name="id" value={x.id} /><input type="hidden" name="empresaId" value={id} /><input type="hidden" name="ativo" value={String(!x.ativo)} /><button className={x.ativo ? 'link-perigo' : 'doc2-btn leve'}>{x.ativo ? 'Parar de pedir (mantém o histórico)' : 'Voltar a pedir'}</button></form>
        </div></details></li>))}
        {!exigencias.length && <li className="soon">Nenhum documento configurado.</li>}</ul>
    </section>
  </main></>);
}
