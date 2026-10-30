import Link from 'next/link';
import { notFound } from 'next/navigation';
import { exigirUsuario } from '@/lib/session';
import { listarEmpresas } from '@/lib/services/empresas';
import { resumoCliente } from '@/lib/services/hub';
import { AppError } from '@/lib/errors';
import { Atalho, Avisos, CompetenciaSeletor, Topo, competenciaDe } from '../../components';

const CONC = { revisao: 'Em preenchimento', enviada: 'Enviada ao escritório', devolvida: 'Devolvida: o escritório pediu correções', concluida: 'Concluída pelo escritório' } as const;

/** Tela inicial do cliente (por empresa): um cartão por tarefa do mês, com a situação de cada uma. */
export default async function ClienteHub({ params, searchParams }: { params: Promise<{ empresaId: string }>; searchParams: Promise<{ competencia?: string; erro?: string; ok?: string }> }) {
  const u = await exigirUsuario('cliente');
  const { empresaId } = await params; const sp = await searchParams; const comp = competenciaDe(sp.competencia); const c = `?competencia=${comp}`;
  let r; try { r = await resumoCliente(u, empresaId, comp); } catch (x) { if (x instanceof AppError) notFound(); throw x; }
  const varias = (await listarEmpresas(u)).length > 1; const [ano, mes] = comp.split('-'); const d = r.docs; const p = r.pendencias;
  const docsInfo = !d.exigidos ? (r.pdfs ? `${r.pdfs} PDF(s) enviado(s)` : 'Nenhum documento pedido neste mês')
    : d.concluida ? 'Tudo entregue e aprovado ✓' : d.rejeitados ? `${d.rejeitados} recusado(s): envie de novo` : d.pendentes ? `Faltam ${d.pendentes} de ${d.exigidos}` : `Enviados; aguardando o escritório`;
  return (<><Topo u={u} /><main>
    {varias && <p><Link href="/cliente">← Minhas empresas</Link></p>}
    <div className="saudacao"><div><h1>{r.empresa.razao_social}</h1><p className="soon" style={{ margin: '4px 0 0' }}>Olá, {u.nome.split(' ')[0]}. Estas são as tarefas de {mes}/{ano}.</p></div><CompetenciaSeletor atual={comp} mini /></div>
    <Avisos erro={sp.erro} ok={sp.ok} />
    {p.aguardando > 0 && <div className="msg-err" role="alert"><strong>O escritório aguarda sua resposta em {p.aguardando} solicitação(ões){p.vencidas > 0 ? ` (${p.vencidas} com prazo vencido)` : ''}.</strong> <a href={`/cliente/${empresaId}/pendencias`}>Responder</a></div>}
    <div className="hub">
      <Atalho href={`/cliente/${empresaId}/documentos${c}`} icone="docs" titulo="Documentos do mês" desc="Envie os documentos pedidos e outros PDFs"
        info={docsInfo} alerta={d.rejeitados > 0 || d.pendentes > 0} ok={d.concluida} />
      <Atalho href={`/cliente/${empresaId}/extratos${c}`} icone="banco" titulo="Extratos e conciliação" desc="Envie o extrato e identifique entradas e saídas"
        info={r.movimentacoes ? CONC[r.conciliacao] : 'Nenhum extrato enviado ainda'} alerta={r.conciliacao === 'devolvida' || (!r.movimentacoes)} ok={r.conciliacao === 'concluida'} />
      <Atalho href={`/cliente/${empresaId}/informes${c}`} icone="dinheiro" titulo="Retiradas dos sócios" desc="Pró-labore, lucros e outras retiradas"
        info={r.retiradas ? (r.retiradas.sem_retiradas ? 'Informado: sem retiradas ✓' : 'Enviadas ao escritório ✓') : 'Ainda não informadas'} alerta={!r.retiradas} ok={!!r.retiradas} />
      <Atalho href={`/cliente/${empresaId}/pendencias`} icone="conversa" titulo="Pendências" desc="Solicitações do escritório"
        info={p.aguardando ? `${p.aguardando} aguardando você` : p.abertas ? `${p.abertas} em andamento` : 'Nenhuma pendência'} alerta={p.aguardando > 0} ok={!p.abertas} />
    </div>
  </main></>);
}
