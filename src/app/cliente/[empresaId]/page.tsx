import { notFound } from 'next/navigation';
import { exigirUsuario } from '@/lib/session';
import { obterEmpresa } from '@/lib/services/empresas';
import { situacaoCompetencia } from '@/lib/services/documentos';
import { AppError } from '@/lib/errors';
import { resumoPendencias } from '@/lib/services/pendencias';
import { Avisos, CompetenciaSeletor, ROTULO, Topo, competenciaDe } from '../../components';
import { acaoEnviarArquivo } from '../actions';


export default async function ClienteEmpresa({ params, searchParams }: { params: Promise<{ empresaId: string }>; searchParams: Promise<{ competencia?: string; erro?: string; ok?: string }> }) {
  const u = await exigirUsuario('cliente');
  const { empresaId } = await params; const sp = await searchParams;
  const comp = competenciaDe(sp.competencia);
  let e, s;
  try { e = await obterEmpresa(u, empresaId); s = await situacaoCompetencia(u, empresaId, comp); } catch (x) { if (x instanceof AppError) notFound(); throw x; }
  const [ano, mes] = comp.split('-'); const ind = s.indicadores; const pend = await resumoPendencias(u, empresaId);
  return (<><Topo u={u} /><main>
    <h1>Bem-vindo, {e.razao_social}</h1><Avisos erro={sp.erro} ok={sp.ok} />
    {pend.aguardando > 0 && <div className="msg-err" role="alert"><strong>Você tem {pend.aguardando} solicitação(ões) do escritório aguardando sua resposta{pend.vencidas > 0 ? ` (${pend.vencidas} com prazo vencido)` : ''}.</strong> <a href={`/cliente/${empresaId}/pendencias`}>Ver pendências</a></div>}
    <CompetenciaSeletor atual={comp} />
    <div className="card"><h2>Documentos de {mes}/{ano}</h2>
      <p>{ind.aprovados} de {ind.exigidos} obrigatórios aprovados ({ind.percentual}%){ind.concluida ? ' — competência concluída' : ''}. Pendentes: {ind.pendentes} · Rejeitados: {ind.rejeitados}.</p>
      <table><thead><tr><th>Documento</th><th>Situação</th><th>Enviar</th></tr></thead><tbody>
        {s.itens.map((i) => (<tr key={i.exigencia_id}>
          <td><strong>{i.nome}</strong>{i.instituicao && ` — ${i.instituicao}`}{!i.obrigatorio && <span className="tag off"> opcional</span>}
            {i.instrucoes && <div className="soon">{i.instrucoes}</div>}<div className="soon">Formatos: {i.formatos.join(', ').toUpperCase()}</div></td>
          <td><span className="tag">{ROTULO[i.situacao]}</span>{i.arquivo_id && <div className="soon">v{i.versao} · <a href={`/api/arquivos/${i.arquivo_id}`}>{i.nome_original}</a></div>}
            {i.situacao === 'rejeitado' && <div className="msg-err" style={{ marginTop: 6 }}>Motivo: {i.motivo_rejeicao}</div>}</td>
          <td>{i.situacao === 'aprovado' ? <span className="soon">Aprovado</span> : (
            <form action={acaoEnviarArquivo}><input type="hidden" name="empresaId" value={empresaId} /><input type="hidden" name="competencia" value={comp} /><input type="hidden" name="exigenciaId" value={i.exigencia_id} />
              <input type="file" name="arquivo" required accept={i.formatos.map((f: string) => '.' + f).join(',')} /><button>{i.arquivo_id ? 'Enviar novo arquivo' : 'Enviar arquivo'}</button></form>)}</td></tr>))}
        {!s.itens.length && <tr><td colSpan={3} className="soon">Nenhum documento exigido nesta competência.</td></tr>}
      </tbody></table></div>
    <div className="card"><h2>Extratos bancários</h2><p>Envie os extratos do mês e identifique cada entrada e saída.</p><a className="btn" href={`/cliente/${empresaId}/extratos?competencia=${comp}`}>Abrir extratos de {mes}/{ano}</a></div>
    <div className="card"><h2>Informes de lucros e retiradas</h2><p>Consulte e baixe os informes dos sócios disponibilizados pelo escritório.</p><a className="btn" href={`/cliente/${empresaId}/informes`}>Abrir informes</a></div>
    <div className="card"><h2>Pendências do escritório</h2><p>{pend.abertas ? `${pend.abertas} em andamento${pend.aguardando ? ` · ${pend.aguardando} aguardando você` : ''}.` : 'Nenhuma pendência em andamento.'}</p><a className="btn" href={`/cliente/${empresaId}/pendencias`}>Abrir pendências</a></div>
  </main></>);
}
