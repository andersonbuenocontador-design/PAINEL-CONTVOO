import { notFound } from 'next/navigation';
import { exigirUsuario } from '@/lib/session';
import { obterEmpresa } from '@/lib/services/empresas';
import { listarAvulsos, situacaoCompetencia } from '@/lib/services/documentos';
import { AppError } from '@/lib/errors';
import { Avisos, CompetenciaSeletor, ROTULO, Topo, competenciaDe } from '../../../components';
import { acaoEnviarArquivo, acaoEnviarAvulsos, acaoRemoverAvulso } from '../../actions';
import { ExcluirArquivo } from '../../ExcluirArquivo';


export default async function DocumentosCliente({ params, searchParams }: { params: Promise<{ empresaId: string }>; searchParams: Promise<{ competencia?: string; erro?: string; ok?: string }> }) {
  const u = await exigirUsuario('cliente');
  const { empresaId } = await params; const sp = await searchParams;
  const comp = competenciaDe(sp.competencia);
  let e, s;
  try { e = await obterEmpresa(u, empresaId); s = await situacaoCompetencia(u, empresaId, comp); } catch (x) { if (x instanceof AppError) notFound(); throw x; }
  const [ano, mes] = comp.split('-'); const ind = s.indicadores; const avulsos = await listarAvulsos(u, empresaId, comp);
  const ICONE_ST: Record<string, React.ReactNode> = {
    aprovado: <path d="m5 12.5 4.5 4.5L19 7.5" />,
    rejeitado: <path d="M7 7l10 10M17 7 7 17" />,
    enviado: <><circle cx="12" cy="12" r="8" /><path d="M12 8v4.5l3 2" /></>,
    em_conferencia: <><circle cx="11" cy="11" r="6" /><path d="m20 20-4.5-4.5" /></>,
    pendente: <path d="M12 5v14M5 12h14" />,
  };
  const dataHora = (d: Date) => new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  return (<><Topo u={u} /><main className="docs">
    <p><a href={`/cliente/${empresaId}?competencia=${comp}`}>← {e.razao_social}</a></p>
    <div className="saudacao"><h1>Documentos do mês</h1><CompetenciaSeletor atual={comp} mini /></div>
    <Avisos erro={sp.erro} ok={sp.ok} />

    <section className="card docs-resumo" aria-labelledby="docs-t">
      <div className="docs-resumo-topo"><h2 id="docs-t">Documentos de {mes}/{ano}</h2>
        <span className={`docs-selo ${ind.concluida ? 'ok' : ind.rejeitados ? 'erro' : ind.pendentes ? 'alerta' : 'info'}`}>{ind.concluida ? 'Tudo aprovado' : ind.rejeitados ? 'Há documento recusado' : ind.pendentes ? `Faltam ${ind.pendentes}` : 'Enviados, aguardando o escritório'}</span></div>
      {ind.exigidos > 0 && <><div className="docs-barra" role="progressbar" aria-valuenow={ind.percentual} aria-valuemin={0} aria-valuemax={100} aria-label="Documentos aprovados"><div style={{ width: `${ind.percentual}%` }} /></div>
        <p className="soon docs-conta">{ind.aprovados} de {ind.exigidos} obrigatórios aprovados ({ind.percentual}%){ind.concluida ? ' — competência concluída' : ''} · Pendentes: {ind.pendentes} · Recusados: {ind.rejeitados}</p></>}

      <ul className="docs-lista">
        {s.itens.map((i) => (<li key={i.exigencia_id} className={`doc-item st-${i.situacao}`}>
          <span className="doc-icone" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">{ICONE_ST[i.situacao] ?? ICONE_ST.pendente}</svg></span>
          <div className="doc-info">
            <div className="doc-nome"><strong>{i.nome}</strong>{i.instituicao && <span className="soon"> · {i.instituicao}</span>}{!i.obrigatorio && <span className="tag off">opcional</span>}</div>
            <div className="doc-meta"><span className={`tag st-${i.situacao}`}>{ROTULO[i.situacao]}</span><span className="soon">Formatos: {i.formatos.join(', ').toUpperCase()}</span></div>
            {i.instrucoes && <div className="soon">{i.instrucoes}</div>}
            {i.arquivo_id && <div className="doc-arquivo"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></svg>
              <a href={`/api/arquivos/${i.arquivo_id}`}>{i.nome_original}</a><span className="soon">v{i.versao}{i.enviado_em ? ` · ${dataHora(i.enviado_em)}` : ''}</span>
              {i.situacao === 'enviado' && <ExcluirArquivo id={i.arquivo_id} empresaId={empresaId} competencia={comp} nome={i.nome_original} />}</div>}
            {i.situacao === 'rejeitado' && <div className="msg-err doc-motivo">Motivo: {i.motivo_rejeicao}</div>}
          </div>
          <div className="doc-acao">{i.situacao === 'aprovado' ? <span className="doc-aprovado">Aprovado</span> : (
            <form action={acaoEnviarArquivo} className="doc-envio"><input type="hidden" name="empresaId" value={empresaId} /><input type="hidden" name="competencia" value={comp} /><input type="hidden" name="exigenciaId" value={i.exigencia_id} />
              <input type="file" name="arquivo" required accept={i.formatos.map((f: string) => '.' + f).join(',')} aria-label={`Arquivo de ${i.nome}`} />
              <button className={i.arquivo_id ? 'sec' : ''}>{i.arquivo_id ? 'Enviar novo arquivo' : 'Enviar arquivo'}</button></form>)}</div>
        </li>))}
        {!s.itens.length && <li className="soon docs-vazio">Nenhum documento pedido nesta competência.</li>}
      </ul>
    </section>

    <section className="card" id="outros" aria-labelledby="outros-t"><h2 id="outros-t">Outros documentos (PDF)</h2>
      <p className="soon">Envie aqui qualquer outro PDF para o escritório (notas, recibos, contratos, guias…). Pode selecionar vários de uma vez, até 20 MB no total.</p>
      <form action={acaoEnviarAvulsos} className="docs-upload"><input type="hidden" name="empresaId" value={empresaId} /><input type="hidden" name="competencia" value={comp} />
        <input type="file" name="arquivos" multiple required accept=".pdf,application/pdf" aria-label="PDFs para enviar" />
        <input name="descricao" maxLength={200} placeholder="Descrição (opcional), ex.: notas de compra" aria-label="Descrição" />
        <button>Enviar PDF</button></form>
      {avulsos.length > 0 && <ul className="avulsos">
        {avulsos.map((d) => (<li key={d.id}>
          <span className="pdf-icone" aria-hidden="true">PDF</span>
          <div className="doc-info">{d.descartado_em ? <span className="soon">{d.nome_original} (descartado)</span> : <a href={`/api/avulsos/${d.id}`}>{d.nome_original}</a>}
            <span className="soon">{d.descricao ? `${d.descricao} · ` : ''}enviado em {dataHora(d.enviado_em)}</span></div>
          {d.visto_em ? <span className="tag st-aprovado">Recebido pelo escritório</span>
            : <form action={acaoRemoverAvulso}><input type="hidden" name="empresaId" value={empresaId} /><input type="hidden" name="competencia" value={comp} /><input type="hidden" name="id" value={d.id} /><button className="sec">Retirar</button></form>}
        </li>))}
      </ul>}</section>
  </main></>);
}
