import { notFound } from 'next/navigation';
import { exigirUsuario } from '@/lib/session';
import { obterEmpresa } from '@/lib/services/empresas';
import { listarAvulsos, situacaoCompetencia } from '@/lib/services/documentos';
import { contarExtratosDoMes } from '@/lib/services/extratos';
import { AppError } from '@/lib/errors';
import { Avisos, CompetenciaSeletor, Topo, competenciaDe } from '../../../components';
import { acaoRemoverAvulso } from '../../actions';
import { ExcluirArquivo } from '../../ExcluirArquivo';
import { ApagarExtratosMes } from '../../ApagarExtratosMes';
import { EnviarDocumento } from '../../EnviarDocumento';
import { EnviarOutros } from '../../EnviarOutros';

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
/** Situação em linguagem do cliente (sem "rejeitado"/"recusado"). */
const SITUACAO: Record<string, { txt: string; cls: string }> = {
  pendente: { txt: 'Falta enviar', cls: 'falta' },
  enviado: { txt: 'Recebido · o escritório vai conferir', cls: 'recebido' },
  em_conferencia: { txt: 'Recebido · o escritório está conferindo', cls: 'recebido' },
  aprovado: { txt: 'Aprovado', cls: 'ok' },
  rejeitado: { txt: 'Precisa enviar de novo', cls: 'ajuste' },
};
const ICONE: Record<string, React.ReactNode> = {
  ok: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  recebido: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  ajuste: <><path d="M12 8v5" /><path d="M12 16.5v.5" /></>,
  falta: <path d="M12 6v12M6 12h12" />,
};

export default async function DocumentosCliente({ params, searchParams }: { params: Promise<{ empresaId: string }>; searchParams: Promise<{ competencia?: string; erro?: string; ok?: string }> }) {
  const u = await exigirUsuario('cliente');
  const { empresaId } = await params; const sp = await searchParams;
  const comp = competenciaDe(sp.competencia);
  let e, s;
  try { e = await obterEmpresa(u, empresaId); s = await situacaoCompetencia(u, empresaId, comp); } catch (x) { if (x instanceof AppError) notFound(); throw x; }
  const [ano, mes] = comp.split('-'); const nomeMes = MESES[Number(mes) - 1];
  const [avulsos, ext] = await Promise.all([listarAvulsos(u, empresaId, comp), contarExtratosDoMes(u, empresaId, comp)]);
  const ind = s.indicadores;
  const prontos = s.itens.filter((i) => i.situacao !== 'pendente' && i.situacao !== 'rejeitado').length;
  const faltam = s.itens.filter((i) => i.situacao === 'pendente' || i.situacao === 'rejeitado').length;
  const pct = s.itens.length ? Math.round((prontos / s.itens.length) * 100) : 100;
  const hero = !s.itens.length ? { t: 'Nada pedido neste mês', d: 'Se tiver algum documento para o escritório, é só mandar logo abaixo.', cls: 'ok' }
    : ind.concluida ? { t: 'Tudo certo! 🎉', d: `O escritório já aprovou os documentos de ${nomeMes}.`, cls: 'ok' }
    : faltam === 0 ? { t: 'Pronto, você enviou tudo!', d: 'Agora é com o escritório. Avisamos se precisar de algo.', cls: 'ok' }
    : ind.rejeitados && faltam === ind.rejeitados ? { t: 'Quase lá!', d: faltam === 1 ? 'Só 1 documento precisa ser enviado de novo.' : `Só ${faltam} documentos precisam ser enviados de novo.` }
    : { t: faltam === 1 ? 'Falta só 1 documento' : `Faltam ${faltam} documentos`, d: 'É rapidinho: toque em Enviar e escolha o arquivo.' };
  const dataHora = (d: Date) => new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  return (<><Topo u={u} /><main className="docs d2">
    <p className="d2-voltar"><a href={`/cliente/${empresaId}?competencia=${comp}`}>← {e.razao_social}</a></p>
    <div className="d2-topo"><h1>Documentos de {nomeMes}</h1><CompetenciaSeletor atual={comp} mini /></div>
    <Avisos erro={sp.erro} ok={sp.ok} />

    <section className={`card d2-hero ${hero.cls ?? ''}`} aria-live="polite">
      <div><h2>{hero.t}</h2><p>{hero.d}</p></div>
      {s.itens.length > 0 && <div className="d2-progresso" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Documentos enviados">
        <div className="d2-barra"><div style={{ width: `${pct}%` }} /></div><span>{prontos} de {s.itens.length}</span></div>}
    </section>

    {s.itens.length > 0 && <section className="card d2-lista" aria-label={`Documentos pedidos de ${mes}/${ano}`}><ul>
      {s.itens.map((i) => { const st = SITUACAO[i.situacao] ?? SITUACAO.pendente; return (<li key={i.exigencia_id} className={`d2-item ${st.cls}`}>
        <span className="d2-icone" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">{ICONE[st.cls]}</svg></span>
        <div className="d2-info">
          <div className="d2-nome">{i.nome}{i.instituicao && <span> · {i.instituicao}</span>}{!i.obrigatorio && <span className="d2-opc">opcional</span>}</div>
          <div className="d2-sit">{st.txt}{i.arquivo_id && i.situacao !== 'rejeitado' && <> · <a href={`/api/arquivos/${i.arquivo_id}`}>{i.nome_original}</a></>}</div>
          {i.situacao === 'rejeitado' && i.motivo_rejeicao && <div className="d2-recado">Recado do escritório: {i.motivo_rejeicao}</div>}
          {i.instrucoes && (i.situacao === 'pendente' || i.situacao === 'rejeitado') && <div className="d2-dica">{i.instrucoes}</div>}
        </div>
        <div className="d2-acao">
          {i.situacao === 'pendente' && <EnviarDocumento empresaId={empresaId} competencia={comp} exigenciaId={i.exigencia_id} formatos={i.formatos} nome={i.nome} texto="Enviar" />}
          {i.situacao === 'rejeitado' && <EnviarDocumento empresaId={empresaId} competencia={comp} exigenciaId={i.exigencia_id} formatos={i.formatos} nome={i.nome} texto="Enviar de novo" />}
          {(i.situacao === 'enviado' || i.situacao === 'em_conferencia') && <div className="d2-acoes-leves">
            <EnviarDocumento empresaId={empresaId} competencia={comp} exigenciaId={i.exigencia_id} formatos={i.formatos} nome={i.nome} texto="Trocar" discreto />
            {i.situacao === 'enviado' && i.arquivo_id && <ExcluirArquivo id={i.arquivo_id} empresaId={empresaId} competencia={comp} nome={i.nome_original} />}</div>}
        </div>
      </li>); })}
    </ul></section>}

    <section className="card d2-outros" id="outros" aria-labelledby="outros-t">
      <h2 id="outros-t">Tem mais algum documento?</h2>
      <p className="d2-sub">Notas, recibos, contratos, guias, fotos, planilhas… pode mandar qualquer arquivo, vários de uma vez (até 20 MB).</p>
      <EnviarOutros empresaId={empresaId} competencia={comp} />
      {avulsos.length > 0 && <ul className="d2-avulsos">
        {avulsos.map((d) => (<li key={d.id}>
          <div className="d2-info">{d.descartado_em ? <span className="d2-sub">{d.nome_original} (descartado)</span> : <a href={`/api/avulsos/${d.id}`}>{d.nome_original}</a>}
            <span className="d2-sub">{d.descricao ? `${d.descricao} · ` : ''}{dataHora(d.enviado_em)}{d.visto_em ? ' · recebido pelo escritório ✓' : ''}</span></div>
          {!d.visto_em && <form action={acaoRemoverAvulso}><input type="hidden" name="empresaId" value={empresaId} /><input type="hidden" name="competencia" value={comp} /><input type="hidden" name="id" value={d.id} /><button className="link-perigo">Retirar</button></form>}
        </li>))}
      </ul>}
    </section>

    {(ext.extratos > 0 || ext.lancamentos > 0) && <details className="d2-extrato-errado">
      <summary>Enviou um extrato errado?</summary>
      <p className="d2-sub">Apaga todos os extratos enviados em {mes}/{ano} ({ext.extratos}), mesmo os já aprovados, e a conciliação do mês ({ext.lancamentos} lançamento(s)). Depois é só enviar os extratos certos.</p>
      <ApagarExtratosMes empresaId={empresaId} competencia={comp} extratos={ext.extratos} lancamentos={ext.lancamentos} />
    </details>}
  </main></>);
}
