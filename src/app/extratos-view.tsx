import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/inter/800.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import { notFound } from 'next/navigation';
import type { UsuarioSessao } from '@/lib/services/usuarios';
import { obterEmpresa } from '@/lib/services/empresas';
import { listarContas, listarImportacoes, obterPrevia } from '@/lib/services/extratos';
import { puxarExtratosDosDocumentos } from '@/lib/services/extratos';
import { bancosConciliacao, conferenciaSaldos, listarConciliacao, listarPlano, obterConciliacao, resumoLinhas } from '@/lib/services/conciliacao';
import { ConciliacaoTabela } from './ConciliacaoTabela';
import './conciliacao.css';
import { AppError } from '@/lib/errors';
import { brl, dataBr } from '@/lib/format';
import { Avisos, Topo } from './components';
import { acaoAtivarConta, acaoCancelarImportacao, acaoConfirmarImportacao, acaoCriarConta, acaoEnviarExtrato } from './extratos-actions';
import { acaoConcluirConciliacao, acaoDevolverConciliacao, acaoEnviarConferencia, acaoReabrirConciliacao } from './conciliacao-actions';

type SP = { competencia?: string; erro?: string; ok?: string; pendentes?: string; conta?: string };
async function empresaOu404(u: UsuarioSessao, id: string) { try { return await obterEmpresa(u, id); } catch (e) { if (e instanceof AppError) notFound(); throw e; } }

export async function ExtratosPagina({ u, empresaId, comp, sp, base, voltar }: { u: UsuarioSessao; empresaId: string; comp: string; sp: SP; base: string; voltar: string }) {
  const e = await empresaOu404(u, empresaId);
  // puxa sozinho os extratos dos documentos anexados (Documentos do mês e Outros documentos) que ainda não foram lidos
  const puxados = await puxarExtratosDosDocumentos(u, empresaId).catch(() => []);
  const outrosMeses = [...new Set(puxados.filter((r) => r.competencia !== comp && r.gravadas > 0).map((r) => r.competencia))];
  const [contasTodas, linhas, plano, bancosImp, imps, conc, saldos] = await Promise.all([
    listarContas(u, empresaId), listarConciliacao(u, empresaId, comp), listarPlano(u, empresaId), bancosConciliacao(u, empresaId, comp), listarImportacoes(u, empresaId, comp), obterConciliacao(u, empresaId, comp), conferenciaSaldos(u, empresaId, comp),
  ]);
  const status = conc.status; const admin = u.papel === 'admin'; const somenteLeitura = !admin && (status === 'enviada' || status === 'concluida');
  const ROT = { revisao: 'Em revisão', enviada: 'Enviada ao escritório', devolvida: 'Devolvida para correção', concluida: 'Concluída' } as const;
  const nCorrecoes = linhas.filter((l) => l.correcao_pedida).length; const semConta = linhas.filter((l) => l.conta_codigo == null).length;
  const brl2 = (c: number | null) => (c == null ? '—' : (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
  const contas = contasTodas.filter((c) => c.ativo);
  const rs = resumoLinhas(linhas);
  const [ano, mes] = comp.split('-');
  type Res = { periodo: string[] | null; entradas: number; saidas: number; saldoFinalInformado: number | null; conferenciaSaldo?: { saldoAnterior: number | null; saldoFinalInformado: number | null; confere: boolean | null; diferenca: number | null } | null };
  const porConta = new Map<string, { nome: string; conta: string | null; itens: typeof bancosImp }>();
  for (const b of bancosImp) { const g = porConta.get(b.conta_bancaria_id) ?? { nome: b.banco, conta: b.conta, itens: [] as typeof bancosImp }; g.itens.push(b); porConta.set(b.conta_bancaria_id, g); }
  const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  const n2 = (c: number | null | undefined) => (c == null ? '—' : (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  return (<>
    <Topo u={u} /><main style={{ maxWidth: 1320 }}><div className="conc" style={{ display: 'grid', gap: 20 }}>
      <div className="cab">
        <div><a className="btn peq" href={voltar} style={{ marginBottom: 8 }}>← Voltar</a>
          <div className="eyebrow">{mes}/{ano}</div><h1>{e.razao_social}</h1>
          <div className="linha-flex" style={{ marginTop: 6 }}><span className={`chip ${status === 'concluida' ? 'status-concluida' : status === 'devolvida' ? 'baixa' : 'status-revisao'}`}>{ROT[status]}</span><span className="muted" style={{ fontSize: 13 }}>{rs.linhas} lançamento(s) · {rs.naoRev} para revisar</span></div></div>
        <div className="acoes">
          <a className="btn pri" href={`/api/conciliacao/exportar?empresaId=${empresaId}&competencia=${comp}`}>Baixar Excel</a>
          {u.papel === 'admin' && <a className="btn" href={`/admin/empresas/${empresaId}/plano`}>Plano de contas</a>}
          {!admin && (status === 'revisao' || status === 'devolvida') && <form action={acaoEnviarConferencia}><input type="hidden" name="empresaId" value={empresaId} /><input type="hidden" name="competencia" value={comp} /><button className="btn pri">Concluir e enviar ao escritório</button></form>}
          {admin && status === 'enviada' && <form action={acaoConcluirConciliacao}><input type="hidden" name="empresaId" value={empresaId} /><input type="hidden" name="competencia" value={comp} /><button className="btn pri">Aprovar e concluir</button></form>}
          {admin && status === 'enviada' && <details style={{ position: 'relative' }}><summary className="btn perigo" style={{ listStyle: 'none', cursor: 'pointer' }}>Devolver para correção</summary>
            <form action={acaoDevolverConciliacao} className="painel" style={{ position: 'absolute', right: 0, zIndex: 10, width: 340, boxShadow: 'var(--sh2)' }}><input type="hidden" name="empresaId" value={empresaId} /><input type="hidden" name="competencia" value={comp} />
              <label className="campo">Mensagem para o cliente<span className="dica">As linhas marcadas com "Pedir correção" aparecem para ele com o motivo.</span><textarea name="mensagem" rows={3} maxLength={1000} /></label><button className="btn perigo">Devolver ao cliente</button></form></details>}
          {admin && status !== 'revisao' && <form action={acaoReabrirConciliacao}><input type="hidden" name="empresaId" value={empresaId} /><input type="hidden" name="competencia" value={comp} /><button className="btn">Reabrir para o cliente</button></form>}</div></div>
      {sp.erro && <div className="aviso erro" role="alert">{sp.erro}</div>}{sp.ok && <div className="aviso info">{sp.ok}</div>}
      {puxados.some((r) => r.competencia === comp && r.gravadas > 0) && <div className="aviso info">Extratos anexados nos documentos foram trazidos para esta conciliação: {puxados.filter((r) => r.competencia === comp).map((r) => `${r.gravadas} lançamento(s) do ${r.banco ?? 'banco'}`).join(', ')}.</div>}
      {outrosMeses.length > 0 && <div className="aviso">Também encontrei extratos de outro mês nos documentos: {outrosMeses.map((m, i) => <span key={m}>{i ? ', ' : ''}<a href={`${base}?competencia=${m}`}>{m.slice(5)}/{m.slice(0, 4)}</a></span>)}.</div>}
      {!admin && !somenteLeitura && <div className="aviso info">Os extratos entram aqui sozinhos: anexe o PDF ou OFX do banco em <a href={`${voltar.split('?')[0]}/documentos?competencia=${comp}`}>Documentos do mês</a>.</div>}
      {!plano.length && <div className="aviso">O escritório ainda não cadastrou o plano de contas desta empresa. Sem ele, os lançamentos ficam para classificar manualmente.{u.papel === 'admin' && <> <a href={`/admin/empresas/${empresaId}/plano`}>Cadastrar plano de contas</a></>}</div>}
      {status === 'devolvida' && <div className="aviso erro" role="alert"><strong>O escritório devolveu esta competência para correção.</strong>{conc.mensagem && <> Mensagem: {conc.mensagem}</>} {nCorrecoes > 0 ? `${nCorrecoes} movimentação(ões) estão marcadas com o que precisa ser ajustado (filtro "Correção pedida").` : ''} Depois de ajustar, envie de novo ao escritório.</div>}
      {status === 'enviada' && <div className="aviso info">{admin ? 'O cliente enviou esta competência para conferência. Marque as linhas que precisam de ajuste e devolva, ou aprove.' : 'Competência enviada ao escritório. Aguardando conferência; a edição fica bloqueada até a devolução ou conclusão.'}</div>}
      {status === 'concluida' && <div className="aviso info">Competência concluída pelo escritório.</div>}
      <div className="painel"><h2>Conferência da competência</h2>
        <div className="grid2"><div><div className="eyebrow">Movimentações</div><strong>{linhas.length}</strong></div><div><div className="eyebrow">Classificadas (com conta)</div><strong>{linhas.length - semConta}</strong></div>
          <div><div className="eyebrow">Sem conta</div><strong>{semConta}</strong></div><div><div className="eyebrow">Revisadas (OK)</div><strong>{linhas.filter((l) => l.revisado).length}</strong></div>
          <div><div className="eyebrow">Com correção pedida</div><strong>{nCorrecoes}</strong></div>
          <div><div className="eyebrow">Total de entradas</div><strong className="num">{brl2(linhas.filter((l) => l.valor > 0).reduce((a, l) => a + l.valor, 0))}</strong></div>
          <div><div className="eyebrow">Total de saídas</div><strong className="num">{brl2(Math.abs(linhas.filter((l) => l.valor < 0).reduce((a, l) => a + l.valor, 0)))}</strong></div></div>
        {saldos.length > 0 && <div className="rolagem"><table><thead><tr>{['Conta', 'Saldo inicial', 'Entradas', 'Saídas', 'Saldo final calculado', 'Saldo final do extrato', 'Situação'].map((h, i) => <th key={h} className={i > 0 && i < 6 ? 'r' : ''}>{h}</th>)}</tr></thead><tbody>
          {saldos.map((s) => (<tr key={s.contaId}><td>{s.banco}{s.conta ? ` · ${s.conta}` : ''}</td><td className="r num">{brl2(s.saldoInicial)}</td><td className="r num">{brl2(s.entradas)}</td><td className="r num">{brl2(Math.abs(s.saidas))}</td><td className="r num">{brl2(s.saldoCalculado)}</td><td className="r num">{brl2(s.saldoFinalExtrato)}</td>
            <td>{s.confere === true ? <span className="conf-ok">✓ Confere</span> : s.confere === false ? <span className="conf-erro">Diverge em {brl2(Math.abs(s.diferenca ?? 0))}. Confira se falta importar algum lançamento.</span> : <span className="muted">Sem dados para conferir (o arquivo não traz saldo inicial e final).</span>}</td></tr>))}</tbody></table></div>}
        {saldos.some((s) => s.confere === false) && <div className="aviso erro">Há conta com saldo que não fecha. O sistema só considera a conta conciliada quando o saldo calculado é igual ao do extrato.</div>}</div>
      <form method="get" className="painel"><div className="linha-flex"><label className="campo" style={{ width: 'auto' }}>Competência<select name="competencia" defaultValue={comp} style={{ width: 'auto' }}>{Array.from({ length: 12 }, (_, i) => { const d = new Date(new Date().getFullYear(), new Date().getMonth() - i, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }).map((m) => <option key={m} value={m}>{m.split('-')[1]}/{m.split('-')[0]}</option>)}</select></label><button className="btn">Ver</button></div></form>
      {porConta.size > 0 && <div className="bancos">{[...porConta.entries()].map(([cid, g]) => { const nl = linhas.filter((l) => l.conta_bancaria_id === cid); return (
        <div className="banco" key={cid}><div><h3>{g.nome}{g.conta ? ` · cc ${g.conta}` : ''}</h3></div>
          <div className="rolagem"><table><thead><tr>{['Período', 'Saldo anterior', 'Entradas', 'Saídas', 'Saldo final', ''].map((t, i) => <th key={i} className={i && i < 5 ? 'r' : ''}>{t}</th>)}</tr></thead><tbody>
            {g.itens.map((it) => { const r = it.resumo as Res; const cs = r.conferenciaSaldo; return (<tr key={it.id}><td className="num">{r.periodo ? `${dm(r.periodo[0])}–${dm(r.periodo[1])}/${r.periodo[1].slice(2, 4)}` : it.nome_arquivo}</td>
              <td className="r num">{n2(cs?.saldoAnterior)}</td><td className="r num">{n2(r.entradas)}</td><td className="r num">{n2(Math.abs(r.saidas))}</td><td className="r num">{n2(cs?.saldoFinalInformado ?? r.saldoFinalInformado)}</td>
              <td>{cs?.confere === true ? <span className="conf-ok">✓</span> : cs?.confere === false ? <span className="conf-erro" title="Diferença">dif. {n2(cs.diferenca)}</span> : <span className="muted" title="O arquivo não traz saldo inicial e final">sem saldo</span>}</td></tr>); })}</tbody></table></div>
          <div className="muted" style={{ fontSize: 12 }}>{nl.length} lançamentos · {nl.filter((l) => l.confianca !== 'A').length} para revisar</div></div>); })}</div>}

      {admin && !somenteLeitura && <details className="painel" open={linhas.length === 0 || !!sp.erro}><summary><strong>Enviar extrato e contas bancárias</strong></summary>
        {u.papel === 'admin' && (<div><h3>Contas bancárias da empresa</h3>
          <table><tbody>{contasTodas.map((c) => (<tr key={c.id}><td>{c.banco}{c.apelido && ` — ${c.apelido}`}<div className="muted">Ag. {c.agencia ?? '—'} · Conta {c.conta ?? '—'}</div></td><td>{!c.ativo && <span className="chip neutro">inativa</span>}</td>
            <td><form action={acaoAtivarConta}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="empresaId" value={empresaId} /><input type="hidden" name="ativo" value={String(!c.ativo)} /><button className="btn peq">{c.ativo ? 'Desativar' : 'Reativar'}</button></form></td></tr>))}
            {!contasTodas.length && <tr><td className="muted">Nenhuma conta cadastrada.</td></tr>}</tbody></table>
          <form action={acaoCriarConta}><input type="hidden" name="empresaId" value={empresaId} /><div className="grid2">
            <label className="campo">Banco *<input name="banco" required placeholder="Banrisul" /></label><label className="campo">Apelido<input name="apelido" /></label>
            <label className="campo">Agência<input name="agencia" /></label><label className="campo">Conta<input name="conta" /></label></div><p><button className="btn">Adicionar conta</button></p></form></div>)}
        {(
          <form action={acaoEnviarExtrato}><input type="hidden" name="empresaId" value={empresaId} /><input type="hidden" name="competencia" value={comp} />
            <h3>Enviar extrato de {mes}/{ano}</h3><div className="grid2"><label className="campo">Conta<select name="contaId" defaultValue=""><option value="">Detectar pelo extrato (recomendado)</option>{contas.map((c) => <option key={c.id} value={c.id}>{c.banco}{c.apelido ? ` — ${c.apelido}` : ''}{c.conta ? ` (${c.conta})` : ''}</option>)}</select></label>
              <label className="campo">Arquivo (OFX, CSV, Excel ou PDF com texto)<input type="file" name="arquivo" accept=".ofx,.csv,.xlsx,.pdf" required /></label></div>
            <p className="muted">Você verá uma prévia para conferir antes de gravar. Prefira OFX quando o banco oferecer.</p><button className="btn pri">Ler extrato</button></form>)}
        {imps.length > 0 && <><h3>Importações da competência</h3><table><tbody>{imps.map((i) => (<tr key={i.id}><td>{i.banco} · {i.nome_arquivo}</td><td><span className="chip neutro">{i.status === 'previa' ? 'aguardando confirmação' : 'importada'}</span></td>
          <td>{i.status === 'previa' && <a href={`${base}/importacao/${i.id}`}>Abrir prévia</a>}</td></tr>))}</tbody></table></>}</details>}

      <div id="lancamentos" />
      <ConciliacaoTabela key={sp.conta ?? 'todas'} linhas={linhas} plano={plano.map((c) => ({ codigo: c.codigo, classificacao: c.classificacao, nome: c.nome }))} bancos={[...porConta.entries()].map(([id, g]) => ({ id, nome: g.conta ? `${g.nome} · cc ${g.conta}` : g.nome }))} admin={admin} somenteLeitura={somenteLeitura} bancoInicial={sp.conta && porConta.has(sp.conta) ? sp.conta : undefined} />
    </div></main></>);
}

export async function PreviaPagina({ u, empresaId, id, sp, base }: { u: UsuarioSessao; empresaId: string; id: string; sp: SP; base: string }) {
  await empresaOu404(u, empresaId);
  let p; try { p = await obterPrevia(u, id); } catch (e) { if (e instanceof AppError) notFound(); throw e; }
  if (p.empresaId !== empresaId) notFound();
  const r = p.resumo as { registros: number; entradas: number; saidas: number; periodo: string[] | null; incompletos: number; erros: { linha: number; motivo: string }[]; duplicadasCertas: number; duplicadasPossiveis: number; foraPeriodo: number; aImportar: number; arquivoRepetido: boolean; conferenciaSaldo?: { saldoAnterior: number | null; saldoFinalInformado: number | null; saldoCalculado: number | null; confere: boolean | null; diferenca: number | null } | null };
  const cs = r.conferenciaSaldo;
  const aberta = p.status === 'previa';
  return (<><Topo u={u} /><main>
    <p><a href={`${base}?competencia=${p.competencia}`}>← Voltar aos extratos</a></p>
    <h1>Conferir antes de importar</h1><Avisos erro={sp.erro} />
    <div className="card"><p><strong>{p.nomeArquivo}</strong> · {p.conta.banco}{p.conta.conta && ` (${p.conta.conta})`} · competência {p.competencia.split('-')[1]}/{p.competencia.split('-')[0]}</p>
      <p>Registros identificados: <strong>{r.registros}</strong> · Entradas: <strong>{brl(r.entradas)}</strong> · Saídas: <strong>{brl(Math.abs(r.saidas))}</strong>{r.periodo && <> · Período do extrato: <strong>{dataBr(r.periodo[0])} a {dataBr(r.periodo[1])}</strong></>}</p>
      <p>A importar: <strong>{r.aImportar}</strong></p>
      {r.arquivoRepetido && <div className="msg-err">Este mesmo arquivo já foi importado nesta conta antes.</div>}
      {r.duplicadasCertas > 0 && <div className="msg-err">{r.duplicadasCertas} movimentação(ões) já importada(s) (mesmo identificador do banco) — não serão importadas de novo.</div>}
      {r.duplicadasPossiveis > 0 && <div className="msg-err">{r.duplicadasPossiveis} movimentação(ões) parecem repetidas (mesma data, valor e descrição de uma importação anterior). Marque abaixo apenas as que são legítimas.</div>}
      {r.foraPeriodo > 0 && <div className="msg-err">{r.foraPeriodo} movimentação(ões) são de outro mês e não serão importadas nesta competência.</div>}
      {r.incompletos > 0 && <div className="msg-err">{r.incompletos} linha(s) não puderam ser lidas: {r.erros.map((x) => `linha ${x.linha} (${x.motivo})`).join('; ')}.</div>}
      {cs ? (cs.confere === null ? <p className="soon">O arquivo não traz saldo inicial e final; a conferência de saldo não pôde ser feita.</p>
        : cs.confere ? <div className="msg-ok">Saldo confere: {brl(cs.saldoAnterior ?? 0)} + movimentos = {brl(cs.saldoCalculado ?? 0)} (saldo final do extrato).</div>
        : <div className="msg-err">Atenção: o saldo calculado ({brl(cs.saldoCalculado ?? 0)}) difere do saldo final do extrato ({brl(cs.saldoFinalInformado ?? 0)}). Pode haver lançamentos não lidos; confira antes de importar.</div>)
        : <p className="soon">Este formato não traz saldos suficientes para conferência automática.</p>}</div>
    <form action={acaoConfirmarImportacao}><input type="hidden" name="id" value={id} /><input type="hidden" name="empresaId" value={empresaId} /><input type="hidden" name="competencia" value={p.competencia} />
      <div className="card"><table><thead><tr><th></th><th>Data</th><th>Descrição</th><th>Valor</th><th>Situação</th></tr></thead><tbody>
        {p.linhas.map((l, i) => (<tr key={i}><td>{l.duplicada === 'possivel' && !l.foraPeriodo && aberta && <input type="checkbox" name="incluir" value={i} style={{ width: 'auto' }} aria-label="Importar mesmo assim" />}</td>
          <td>{dataBr(l.data)}</td><td>{l.descricao}</td><td style={{ whiteSpace: 'nowrap' }}>{brl(l.valor)}</td>
          <td>{l.foraPeriodo ? <span className="tag off">outro mês</span> : l.duplicada === 'certa' ? <span className="tag off">já importada</span> : l.duplicada === 'possivel' ? <span className="tag">possível duplicada</span> : <span className="tag">nova</span>}</td></tr>))}
      </tbody></table></div>
      {aberta && <button>Importar {r.aImportar} movimentação(ões)</button>}</form>
    {aberta && <form action={acaoCancelarImportacao} style={{ marginTop: 10 }}><input type="hidden" name="id" value={id} /><input type="hidden" name="empresaId" value={empresaId} /><input type="hidden" name="competencia" value={p.competencia} /><button className="sec">Cancelar (não grava nada)</button></form>}
    {!aberta && <p className="soon">Esta importação já foi {p.status === 'confirmada' ? 'concluída' : 'cancelada'}.</p>}
  </main></>);
}
