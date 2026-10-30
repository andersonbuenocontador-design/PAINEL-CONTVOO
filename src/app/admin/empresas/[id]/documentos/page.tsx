import { notFound } from 'next/navigation';
import { exigirUsuario } from '@/lib/session';
import { obterEmpresa } from '@/lib/services/empresas';
import { listarAvulsos, listarExigencias, situacaoCompetencia, historicoVersoes } from '@/lib/services/documentos';
import { AppError } from '@/lib/errors';
import { Avisos, CompetenciaSeletor, ROTULO, Topo, competenciaDe } from '../../../../components';
import { CamposExigencia } from '../../../FormExigencia';
import { acaoAtivarExigencia, acaoConferir, acaoCriarExigencia, acaoEditarExigencia, acaoEnviarPeloEscritorio, acaoRemoverAvulsoAdmin } from '../../../docs-actions';

export default async function DocsEmpresa({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ competencia?: string; erro?: string; ok?: string }> }) {
  const u = await exigirUsuario('admin'); const { id } = await params; const sp = await searchParams; const comp = competenciaDe(sp.competencia);
  let e; try { e = await obterEmpresa(u, id); } catch (x) { if (x instanceof AppError) notFound(); throw x; }
  const [exigencias, s, avulsos] = await Promise.all([listarExigencias(u, id), situacaoCompetencia(u, id, comp), listarAvulsos(u, id, comp)]);
  const hist = new Map(await Promise.all(s.itens.filter((i) => i.arquivo_id).map(async (i) => [i.exigencia_id, await historicoVersoes(u, id, i.exigencia_id, comp)] as const)));
  const ind = s.indicadores;
  return (<><Topo u={u} /><main>
    <h1>Documentos — {e.razao_social}</h1><Avisos erro={sp.erro} ok={sp.ok} />
    <CompetenciaSeletor atual={comp} />
    <div className="card"><h2>Conferência {comp.split('-')[1]}/{comp.split('-')[0]}</h2>
      <p>Exigidos: {ind.exigidos} · Enviados: {ind.enviados} · Aprovados: {ind.aprovados} · Rejeitados: {ind.rejeitados} · Pendentes: {ind.pendentes} · <strong>{ind.percentual}%</strong>{ind.concluida ? ' · concluída' : ''}</p>
      <table><thead><tr><th>Documento</th><th>Situação</th><th>Ações</th></tr></thead><tbody>
        {s.itens.map((i) => (<tr key={i.exigencia_id}>
          <td><strong>{i.nome}</strong>{i.instituicao && ` — ${i.instituicao}`}{!i.obrigatorio && <span className="tag off"> opcional</span>}</td>
          <td><span className="tag">{ROTULO[i.situacao]}</span>
            {(hist.get(i.exigencia_id) ?? []).map((h) => <div key={h.id} className="soon">v{h.versao} · <a href={`/api/arquivos/${h.id}`}>{h.nome_original}</a> · {h.enviado_por} · {new Date(h.enviado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} · {ROTULO[h.situacao]}{h.motivo_rejeicao ? ` (${h.motivo_rejeicao})` : ''}</div>)}</td>
          <td>{i.arquivo_id && i.situacao !== 'aprovado' && (<div className="row">
            <form action={acaoConferir}><input type="hidden" name="empresaId" value={id} /><input type="hidden" name="competencia" value={comp} /><input type="hidden" name="arquivoId" value={i.arquivo_id} /><input type="hidden" name="decisao" value="aprovado" /><button>Aprovar</button></form>
            {i.situacao === 'enviado' && <form action={acaoConferir}><input type="hidden" name="empresaId" value={id} /><input type="hidden" name="competencia" value={comp} /><input type="hidden" name="arquivoId" value={i.arquivo_id} /><input type="hidden" name="decisao" value="em_conferencia" /><button className="sec">Em conferência</button></form>}
            {i.situacao !== 'rejeitado' && <form action={acaoConferir} className="row"><input type="hidden" name="empresaId" value={id} /><input type="hidden" name="competencia" value={comp} /><input type="hidden" name="arquivoId" value={i.arquivo_id} /><input type="hidden" name="decisao" value="rejeitado" /><input name="motivo" placeholder="Motivo da rejeição" required style={{ width: 200 }} /><button className="danger">Rejeitar</button></form>}</div>)}
            <form action={acaoEnviarPeloEscritorio} style={{ marginTop: 6 }}><input type="hidden" name="empresaId" value={id} /><input type="hidden" name="competencia" value={comp} /><input type="hidden" name="exigenciaId" value={i.exigencia_id} /><input type="file" name="arquivo" required /><button className="sec">Anexar pelo escritório</button></form></td></tr>))}
        {!s.itens.length && <tr><td colSpan={3} className="soon">Nenhum documento exigido nesta competência.</td></tr>}
      </tbody></table></div>
    <div className="card" id="outros"><h2>Outros documentos enviados pelo cliente ({avulsos.length})</h2>
      {avulsos.length ? <table><thead><tr><th>Arquivo</th><th>Enviado</th><th></th></tr></thead><tbody>
        {avulsos.map((d) => (<tr key={d.id}>
          <td>{d.descartado_em ? <span className="soon">{d.nome_original} (descartado)</span> : <a href={`/api/avulsos/${d.id}`}>{d.nome_original}</a>} {!d.visto_em && !d.descartado_em && <span className="tag">Novo</span>}{d.descricao && <div className="soon">{d.descricao}</div>}</td>
          <td>{d.enviado_por} · {new Date(d.enviado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</td>
          <td><form action={acaoRemoverAvulsoAdmin}><input type="hidden" name="empresaId" value={id} /><input type="hidden" name="competencia" value={comp} /><input type="hidden" name="id" value={d.id} /><button className="sec">Retirar</button></form></td></tr>))}
      </tbody></table> : <p className="soon">Nenhum PDF avulso nesta competência.</p>}</div>
    <div className="card"><h2>Documentos exigidos desta empresa</h2>
      {exigencias.map((x) => (<details key={x.id} style={{ borderBottom: '1px solid var(--bd)', padding: '8px 0' }}>
        <summary><strong>{x.nome}</strong>{x.instituicao && ` — ${x.instituicao}`} · {x.frequencia} · {x.formatos.join('/').toUpperCase()}{!x.obrigatorio && ' · opcional'} {!x.ativo && <span className="tag off">inativo</span>}</summary>
        <form action={acaoEditarExigencia}><input type="hidden" name="id" value={x.id} /><input type="hidden" name="empresaId" value={id} /><CamposExigencia e={x} /><p><button>Salvar alterações</button></p></form>
        <form action={acaoAtivarExigencia}><input type="hidden" name="id" value={x.id} /><input type="hidden" name="empresaId" value={id} /><input type="hidden" name="ativo" value={String(!x.ativo)} /><button className="sec">{x.ativo ? 'Desativar (mantém histórico)' : 'Reativar'}</button></form></details>))}
      {!exigencias.length && <p className="soon">Nenhum documento configurado.</p>}</div>
    <div className="card"><h2>Novo documento exigido</h2><form action={acaoCriarExigencia}><input type="hidden" name="empresaId" value={id} /><CamposExigencia /><p><button>Adicionar</button></p></form></div>
  </main></>);
}
