import Link from 'next/link';
import { exigirUsuario } from '@/lib/session';
import { statusGclick } from '@/lib/services/gclick';
import { lerAgenda, lerConfigSolicitacao, previaSolicitacao, proximoEnvio, type ItemSolicitacao, type PreviaSolicitacao } from '@/lib/services/gclick-solicitacao';
import { digisacPronto } from '@/lib/services/digisac';
import { mesPorExtenso } from '@/lib/services/integracao';
import { mensagemDeErro } from '@/lib/actions-util';
import { Avisos, Topo } from '../../../components';
import { acaoEnviarGclick, acaoEnviarWhatsapp, acaoSalvarAgenda } from './actions';
import { BotaoConfirmar } from './BotaoConfirmar';
import { EditorSolicitacao } from './EditorSolicitacao';

const fone = (w: string | null) => { if (!w) return '—'; const d = w.replace(/^55/, ''); return `(${d.slice(0, 2)}) ${d.slice(2, -4)}-${d.slice(-4)}`; };
const dataBr = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '—');
/** Competência atual e as anteriores (fuso de Brasília). */
function competencias() {
  const [a, m] = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).format(new Date()).split('-').map(Number);
  return [1, 0, -1, -2].map((k) => { const d = new Date(Date.UTC(a, m - 1 + k, 1)); return d.toISOString().slice(0, 7); });
}
function Situacao({ e, vazio = 'a enviar', feito = 'enviado' }: { e: ItemSolicitacao['envio']; vazio?: string; feito?: string }) {
  if (!e) return <span className="soon">{vazio}</span>;
  if (e.status === 'ok') return <span className="sol-ok" title={e.detalhe ?? ''}>✔ {feito} {new Date(e.em).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</span>;
  if (e.status === 'erro') return <span className="sol-erro" title={e.detalhe ?? ''}>erro: {(e.detalhe ?? '').slice(0, 60)}</span>;
  return <span className="soon">enviando…</span>;
}
function Lista({ itens, coluna }: { itens: ItemSolicitacao[]; coluna: 'email' | 'celular' | 'nada' }) {
  if (!itens.length) return null;
  return (<details className="sol-detalhe"><summary>Ver os {itens.length} clientes</summary><div className="gclick-lista"><table><thead><tr><th>Cliente</th><th>{coluna === 'email' ? 'E-mails' : 'Celular'}</th><th>Vence</th><th>{coluna === 'email' ? 'Situação' : 'WhatsApp'}</th>{coluna === 'celular' && <th>G-Click (X + ✔)</th>}</tr></thead><tbody>
    {itens.map((it) => <tr key={it.tarefaId}><td><strong>{it.empresa}</strong></td><td>{coluna === 'email' ? it.emails : fone(it.celular)}</td><td>{dataBr(it.vencimento)}</td><td><Situacao e={it.envio} /></td>{coluna === 'celular' && <td><Situacao e={it.gclick} vazio="a marcar" feito="marcado" /></td>}</tr>)}
  </tbody></table></div></details>);
}
const pendentes = (l: ItemSolicitacao[], comGclick = false) => l.filter((x) => x.envio?.status !== 'ok' || (comGclick && x.gclick?.status !== 'ok')).length;

/** Solicitação de documentos do G-Click em dois cliques: ✔ no G-Click (que manda o e-mail) e WhatsApp para quem não tem e-mail. */
export default async function Solicitacao({ searchParams }: { searchParams: Promise<{ competencia?: string; buscar?: string; erro?: string; ok?: string }> }) {
  const u = await exigirUsuario('admin'); const sp = await searchParams;
  const opcoes = competencias(); const comp = sp.competencia && /^\d{4}-\d{2}$/.test(sp.competencia) ? sp.competencia : opcoes[1];
  const [st, cfg, zap, { agenda, ultima }] = await Promise.all([statusGclick(u), lerConfigSolicitacao(), digisacPronto(), lerAgenda()]);
  const prox = agenda.ativo ? proximoEnvio(agenda, ultima) : null;
  let p: PreviaSolicitacao | null = null, erro = '';
  if (st.ligado && sp.buscar) { try { p = await previaSolicitacao(u, comp); } catch (e) { erro = mensagemDeErro(e); } }
  const faltaEmail = p ? pendentes(p.porEmail) : 0, faltaZap = p ? pendentes(p.porWhatsapp, true) : 0;
  return (<><Topo u={u} /><main className="inicio emp">
    <p className="emp-voltar"><Link href="/admin/gclick">← G-Click</Link></p>
    <section className="inicio-ola"><div><h1>Solicitação de documentos</h1>
      <p className="inicio-sub">Tarefa <strong>{cfg.tarefa}</strong> do G-Click para todos os clientes de uma vez: quem tem e-mail recebe o e-mail do próprio G-Click (o painel dá o ✔ verde por você); quem não tem recebe a mensagem padrão pelo WhatsApp (Digisac).</p></div>
      <form className="sol-mes" method="get"><input type="hidden" name="buscar" value="1" />
        <select name="competencia" defaultValue={comp} aria-label="Competência">{opcoes.map((c) => <option key={c} value={c}>{mesPorExtenso(c)}</option>)}</select><button>Ver</button></form></section>
    <Avisos erro={sp.erro || erro} ok={sp.ok} />
    {!st.ligado && <section className="card emp-bloco"><p>Ligue o G-Click primeiro: <Link href="/admin/gclick">G-Click → Acesso à API</Link>.</p></section>}

    {st.ligado && !p && !erro && <section className="card emp-bloco"><p className="soon">Lê as tarefas de <strong>{mesPorExtenso(comp)}</strong> no G-Click e separa quem tem e-mail de quem não tem. Só leitura: nada é enviado.</p>
      <Link className="doc2-btn primario" href={`/admin/gclick/solicitacao?competencia=${comp}&buscar=1`}>Buscar as tarefas de {mesPorExtenso(comp)}</Link></section>}

    {p && <>
      <section className="sol-resumo">
        <div><strong>{p.total}</strong><span>tarefas em {p.mes}</span></div>
        <div><strong>{p.concluidas}</strong><span>já concluídas no G-Click</span></div>
        <div><strong>{p.porEmail.length}</strong><span>abertas com e-mail</span></div>
        <div><strong>{p.porWhatsapp.length}</strong><span>abertas sem e-mail</span></div>
      </section>

      <section className="card emp-bloco sol-passo"><h2><span className="sol-num">1</span> E-mail pelo G-Click <small className="soon">{p.porEmail.length} clientes · {faltaEmail} a enviar</small></h2>
        <p className="soon">Dá o ✔ na atividade &quot;{cfg.tarefa}&quot; de cada tarefa, como o botão verde do G-Click. O G-Click então manda o e-mail dele (&quot;Enviar para o cliente&quot;, AUTO). Quem já tem ✔ é pulado.</p>
        <p className="soon">Comece pelo <strong>Testar com 1 cliente</strong> e confira a tarefa no G-Click. Se o G-Click não aceitar o ✔ pela API, o painel mostra o erro aqui e nada mais é enviado por esse caminho.</p>
        <div className="row">
          <form action={acaoEnviarGclick}><input type="hidden" name="competencia" value={comp} /><input type="hidden" name="teste" value="1" />
            <BotaoConfirmar classe="doc2-btn leve" texto="Testar com 1 cliente" desabilitado={!faltaEmail} pergunta="Dar o ✔ no G-Click em 1 tarefa (o G-Click vai mandar o e-mail para esse cliente)?" /></form>
          <form action={acaoEnviarGclick}><input type="hidden" name="competencia" value={comp} /><input type="hidden" name="teste" value="0" />
            <BotaoConfirmar texto={`✔ Enviar para os ${faltaEmail} com e-mail`} desabilitado={!faltaEmail} pergunta={`Dar o ✔ no G-Click em ${faltaEmail} tarefas? O G-Click vai mandar o e-mail para todos esses clientes.`} /></form>
        </div>
        <Lista itens={p.porEmail} coluna="email" />
      </section>

      <section className="card emp-bloco sol-passo"><h2><span className="sol-num">2</span> WhatsApp pelo Digisac <small className="soon">{p.porWhatsapp.length} clientes sem e-mail · {faltaZap} a enviar</small></h2>
        <p className="soon">Para quem não tem e-mail o ✔ verde dá erro no G-Click, então o painel faz como vocês fazem à mão: manda a mensagem padrão pelo WhatsApp (celular do painel ou, se não houver, o do G-Click) e, depois que ela sai, dá o <strong>X em &quot;Enviar para o cliente&quot;</strong> com o motivo &quot;{cfg.motivoSemEmail}&quot; e o <strong>✔ em &quot;{cfg.tarefa}&quot;</strong>. O nome no &quot;Olá&quot; é o do contato no Digisac.</p>
        {!zap && <p className="sol-erro">O Digisac ainda não está ligado: <Link href="/admin/whatsapp">configurar</Link>.</p>}
        <div className="row">
          <form action={acaoEnviarWhatsapp}><input type="hidden" name="competencia" value={comp} /><input type="hidden" name="teste" value="1" />
            <BotaoConfirmar classe="doc2-btn leve" texto="Testar com 1 cliente" desabilitado={!zap || !faltaZap} pergunta="Mandar a mensagem padrão pelo WhatsApp para 1 cliente e marcar X/✔ na tarefa dele no G-Click?" /></form>
          <form action={acaoEnviarWhatsapp}><input type="hidden" name="competencia" value={comp} /><input type="hidden" name="teste" value="0" />
            <BotaoConfirmar texto={`Enviar WhatsApp para os ${faltaZap} sem e-mail`} desabilitado={!zap || !faltaZap} pergunta={`Mandar a mensagem padrão pelo WhatsApp para ${faltaZap} clientes?`} /></form>
        </div>
        <Lista itens={p.porWhatsapp} coluna="celular" />
        {p.semContato.length > 0 && <><p className="sol-erro">{p.semContato.length} cliente(s) sem e-mail e sem celular: cadastre um dos dois no G-Click.</p><Lista itens={p.semContato} coluna="nada" /></>}
      </section>
    </>}

    {st.ligado && <section className="card emp-bloco sol-agenda" id="agenda"><h2>Envio automático {agenda.ativo ? <span className="emp-situacao ativa">Ligado</span> : <span className="emp-situacao inativa">Desligado</span>}</h2>
      <p className="soon">Todo mês, no dia e hora marcados, o painel faz sozinho os dois cliques acima para a <strong>competência anterior</strong> (ex.: dia 4 de dezembro envia novembro). Roda uma vez por competência; quem já recebeu não recebe de novo. Se o site estiver fora do ar no dia, tenta de novo nos 2 dias seguintes.</p>
      {agenda.ativo && prox && <p className="sol-prox">Próximo envio: <strong>{prox.atrasado ? 'na próxima hora' : `${prox.data} a partir das ${prox.hora}h`}</strong> · competência {mesPorExtenso(prox.competencia)}</p>}
      {ultima && <p className="soon">Último envio automático ({mesPorExtenso(ultima.competencia)}, {new Date(ultima.em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}): {ultima.resumo}</p>}
      <form action={acaoSalvarAgenda} className="emp-form"><input type="hidden" name="competencia" value={comp} />
        <div className="sol-agenda-campos">
          <label className="sol-check"><input type="checkbox" name="ativo" value="1" defaultChecked={agenda.ativo} /> Ligar o envio automático</label>
          <label>Dia do mês <select name="dia" defaultValue={agenda.dia}>{Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}</select></label>
          <label>Hora <select name="hora" defaultValue={agenda.hora}>{Array.from({ length: 15 }, (_, i) => i + 6).map((h) => <option key={h} value={h}>{h}h</option>)}</select></label>
          <label className="sol-check"><input type="checkbox" name="email" value="1" defaultChecked={agenda.email} /> E-mail pelo G-Click (✔)</label>
          <label className="sol-check"><input type="checkbox" name="whatsapp" value="1" defaultChecked={agenda.whatsapp} /> WhatsApp para quem não tem e-mail</label>
        </div>
        <p className="soon">Horário de Brasília. O agendador do GitHub chama o painel de hora em hora; o envio pode começar alguns minutos depois da hora marcada.</p>
        <button>Salvar envio automático</button></form>
    </section>}

    {st.ligado && <section className="card emp-bloco" id="config"><h2>Configuração</h2><EditorSolicitacao cfg={cfg} competencia={comp} /></section>}
  </main></>);
}
