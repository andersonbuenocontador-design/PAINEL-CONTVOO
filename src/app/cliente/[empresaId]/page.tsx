import Link from 'next/link';
import { notFound } from 'next/navigation';
import { exigirUsuario } from '@/lib/session';
import { listarEmpresas } from '@/lib/services/empresas';
import { resumoCliente, resumoFinanceiro } from '@/lib/services/hub';
import { AppError } from '@/lib/errors';
import { ArrowRight, Banknote, Building2, CircleHelp, FileText, Landmark, MessagesSquare } from 'lucide-react';
import { Avisos, CompetenciaSeletor, ConviteAvaliacao, Topo, competenciaDe, saudacaoDoHorario } from '../../components';

const CONC = { revisao: 'Em preenchimento', enviada: 'Enviada ao escritório', devolvida: 'Devolvida: o escritório pediu correções', concluida: 'Concluída pelo escritório' } as const;

/** Tela inicial do cliente (por empresa), no mesmo estilo da do escritório: o que falta no alto, as tarefas do mês em cartões e o resumo financeiro. */
export default async function ClienteHub({ params, searchParams }: { params: Promise<{ empresaId: string }>; searchParams: Promise<{ competencia?: string; erro?: string; ok?: string }> }) {
  const u = await exigirUsuario('cliente');
  const { empresaId } = await params; const sp = await searchParams; const comp = competenciaDe(sp.competencia); const c = `?competencia=${comp}`;
  let r, f; try { [r, f] = await Promise.all([resumoCliente(u, empresaId, comp), resumoFinanceiro(u, empresaId, comp)]); } catch (x) { if (x instanceof AppError) notFound(); throw x; }
  const varias = (await listarEmpresas(u)).length > 1; const [ano, mes] = comp.split('-'); const d = r.docs; const p = r.pendencias;
  const base = `/cliente/${empresaId}`;
  const dt = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: 'numeric', month: 'long' }); const hoje = dt.charAt(0).toUpperCase() + dt.slice(1);
  const pctDocs = d.exigidos ? Math.round(((d.exigidos - d.pendentes - d.rejeitados) / d.exigidos) * 100) : 100;
  const conciliar = r.movimentacoes > 0 && (r.conciliacao === 'revisao' || r.conciliacao === 'devolvida');
  const fazer = [
    d.pendentes > 0 && { href: `${base}/documentos${c}`, n: d.pendentes, txt: d.pendentes === 1 ? 'documento para enviar' : 'documentos para enviar', tom: 'laranja' },
    d.rejeitados > 0 && { href: `${base}/documentos${c}`, n: d.rejeitados, txt: d.rejeitados === 1 ? 'documento para enviar de novo' : 'documentos para enviar de novo', tom: 'laranja' },
    p.aguardando > 0 && { href: `${base}/pendencias`, n: p.aguardando, txt: p.aguardando === 1 ? 'pedido do escritório para responder' : 'pedidos do escritório para responder', tom: 'laranja' },
    conciliar && { href: `${base}/extratos${c}`, n: r.movimentacoes, txt: r.conciliacao === 'devolvida' ? 'movimentações: o escritório pediu correções' : 'movimentações para organizar com o Contvoo AI', tom: 'azul' },
    !r.retiradas && { href: `${base}/informes${c}`, n: null, txt: 'Informar as retiradas dos sócios do mês', tom: 'azul' },
  ].filter(Boolean) as { href: string; n: number | null; txt: string; tom: string }[];
  return (<><Topo u={u} /><main className="inicio">
    {varias && <p className="emp-voltar"><Link href="/cliente">← Minhas empresas</Link></p>}
    <section className="inicio-ola">
      <div><p className="inicio-data">{hoje}</p><h1>{saudacaoDoHorario()}, {r.empresa.nome_fantasia || r.empresa.razao_social}!</h1>
        <p className="inicio-sub">Tarefas de <strong>{MESES[Number(mes) - 1]} de {ano}</strong></p></div>
      <CompetenciaSeletor atual={comp} mini />
    </section>
    <Avisos erro={sp.erro} ok={sp.ok} />

    <section className="inicio-atencao" aria-label="O que falta fazer">
      {fazer.length ? <><h2>Para fazer agora</h2><div className="inicio-chips">{fazer.map((a) => (
        <Link key={a.txt} href={a.href} className={`inicio-chip ${a.tom}`}>{a.n != null && <strong>{a.n}</strong>} {a.txt} <ArrowRight size={14} /></Link>))}</div></>
        : <p className="inicio-tudo-certo">✓ Tudo em dia! Não falta nada seu neste mês.</p>}
    </section>

    <h2 className="inicio-secao">Tarefas do mês</h2>
    <section className="inicio-grandes">
      <Link href={`${base}/documentos${c}`} className="inicio-cartao">
        <span className="ic laranja"><FileText size={22} /></span>
        <div className="corpo"><strong>Documentos do mês</strong><span className="desc">Envie os documentos pedidos e qualquer outro arquivo</span>
          {d.exigidos ? <><div className="barra"><div style={{ width: `${pctDocs}%` }} /></div>
            <span className="num">{d.concluida ? 'Tudo entregue e aprovado ✓' : d.rejeitados ? <b className="alerta">{d.rejeitados} para enviar de novo</b> : d.pendentes ? <b className="alerta">Faltam {d.pendentes} de {d.exigidos}</b> : 'Tudo enviado; o escritório vai conferir'}</span></>
            : <span className="num">{r.pdfs ? `${r.pdfs} arquivo(s) enviado(s)` : 'Nenhum documento pedido neste mês'}</span>}</div>
      </Link>
      <Link href={`${base}/extratos${c}`} className="inicio-cartao">
        <span className="ic azul"><Landmark size={22} /></span>
        <div className="corpo"><strong>Extratos e conciliação</strong><span className="desc">Organize as entradas e saídas do banco com o Contvoo AI</span>
          <span className="num">{!r.movimentacoes ? 'Envie o extrato em Documentos do mês' : r.conciliacao === 'devolvida' ? <b className="alerta">{CONC.devolvida}</b> : CONC[r.conciliacao]}</span></div>
      </Link>
      <Link href={`${base}/informes${c}`} className="inicio-cartao">
        <span className="ic verde"><Banknote size={22} /></span>
        <div className="corpo"><strong>Retiradas dos sócios</strong><span className="desc">Cada retirada de lucro, com o dia e de qual banco saiu</span>
          <span className="num">{r.retiradas ? (r.retiradas.sem_retiradas ? 'Informado: sem retiradas ✓' : 'Enviadas ao escritório ✓') : <b className="alerta">Ainda não informadas</b>}</span></div>
      </Link>
      <Link href={`${base}/pendencias`} className="inicio-cartao">
        <span className="ic roxo"><MessagesSquare size={22} /></span>
        <div className="corpo"><strong>Pendências</strong><span className="desc">Pedidos do escritório para você</span>
          <span className="num">{p.aguardando ? <b className="alerta">{p.aguardando} aguardando sua resposta{p.vencidas ? ` (${p.vencidas} vencida${p.vencidas > 1 ? 's' : ''})` : ''}</b> : p.abertas ? `${p.abertas} em andamento` : 'Nenhuma pendência ✓'}</span></div>
      </Link>
    </section>

    {f.movimentacoes > 0 && <ResumoMes f={f} mes={mes} ano={ano} href={`${base}/extratos${c}`} />}

    <section className="inicio-pequenos" style={{ marginTop: 18 }}>
      <Link href="/ajuda" className="inicio-mini"><CircleHelp size={18} /><span><strong>Ajuda</strong><small>Vídeos e passo a passo</small></span></Link>
      {varias && <Link href="/cliente" className="inicio-mini"><Building2 size={18} /><span><strong>Minhas empresas</strong><small>Trocar de empresa</small></span></Link>}
    </section>
    <ConviteAvaliacao />
  </main></>);
}

const reais = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
/** Variação em relação ao mês anterior (some quando não há base para comparar). */
function Variacao({ atual, antes, bomSubir }: { atual: number; antes?: number; bomSubir: boolean }) {
  if (!antes) return null;
  const pct = Math.round(((atual - antes) / antes) * 100); if (!pct) return <span className="var neutra">igual ao mês anterior</span>;
  return <span className={`var ${(pct > 0) === bomSubir ? 'boa' : 'ruim'}`}>{pct > 0 ? '+' : ''}{pct}% vs. mês anterior</span>;
}
/** Resumo do mês para o cliente: entradas, saídas, resultado e os maiores gastos (a partir dos extratos anexados). */
function ResumoMes({ f, mes, ano, href }: { f: Awaited<ReturnType<typeof resumoFinanceiro>>; mes: string; ano: string; href: string }) {
  const maior = Math.max(...f.maioresGastos.map((g) => g.valor), 1);
  return (<section className="card resumo-mes" aria-labelledby="resumo-mes-t">
    <div className="resumo-cab"><h2 id="resumo-mes-t">Resumo de {MESES[Number(mes) - 1]} de {ano}</h2><Link href={href}>Ver movimentações</Link></div>
    <div className="resumo-kpis">
      <div className="kpi"><span>Entrou</span><strong className="pos">{reais(f.entradas)}</strong><Variacao atual={f.entradas} antes={f.anterior?.entradas} bomSubir /></div>
      <div className="kpi"><span>Saiu</span><strong className="neg">{reais(f.saidas)}</strong><Variacao atual={f.saidas} antes={f.anterior?.saidas} bomSubir={false} /></div>
      <div className="kpi"><span>Ficou no banco</span>{f.ficouNoBanco != null
        ? <strong className={f.ficouNoBanco >= 0 ? 'pos' : 'neg'}>{reais(f.ficouNoBanco)}</strong>
        : <strong className="neutro">—</strong>}
        <span className="var neutra">{f.ficouNoBanco != null ? <>resultado do mês: <b className={f.resultado >= 0 ? 'pos-t' : 'neg-t'}>{reais(f.resultado)}</b></> : <>Informe o saldo anterior {f.contasSemSaldo > 1 ? `de ${f.contasSemSaldo} contas` : 'da conta'} em <Link href={href}>Extratos</Link></>}</span></div>
    </div>
    {f.maioresGastos.length > 0 && <><h3>Maiores gastos</h3><ol className="gastos">{f.maioresGastos.map((g) => (
      <li key={g.categoria}><div className="gasto-lin"><span>{g.categoria}</span><strong>{reais(g.valor)}</strong></div>
        <div className="barra" aria-hidden="true"><div style={{ width: `${Math.max(3, (g.valor / maior) * 100)}%` }} /></div></li>))}</ol></>}
    {f.semCategoria > 0 && <p className="sem-cat">{reais(f.semCategoria)} em saídas ainda sem categoria. <Link href={href}>Organizar com o Contvoo AI</Link> para ver o resumo completo.</p>}
    <p className="soon">Com base nos extratos anexados. Transferências entre contas da própria empresa não entram na conta.</p>
  </section>);
}
