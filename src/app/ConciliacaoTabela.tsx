'use client';
import { Fragment, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { acaoClassificarLote, acaoConfirmarLinhas, acaoEditarLinha, acaoLimparCorrecao, acaoPedirCorrecao, acaoSemNota } from './conciliacao-actions';

export type Linha = { id: number; data: string; descricao_original: string; valor: number; documento: string | null; banco: string; conta_bancaria_id: string; conta_codigo: number | null; conta_nome: string | null; classificacao: string | null; complemento: string | null; confianca: 'A' | 'M' | 'B'; motivo: string | null; observacao: string | null; origem: string; revisado: boolean; revisado_por: string | null; correcao_pedida: boolean; correcao_motivo: string | null; conta_grupo: string | null; nota_fiscal: string | null; sem_nota: boolean };
export type ContaPlano = { codigo: number; classificacao: string; nome: string; grupo?: string | null; descricao?: string | null; tipo?: 'C' | 'D' | 'T' | 'CD' | null };
/** Categorias agrupadas (sem código nem classificação); com o sentido do lançamento, mostra só as que servem para entrada ou saída. */
function OpcoesCategorias({ plano, sentido }: { plano: ContaPlano[]; sentido?: 'C' | 'D' }) {
  const serve = (c: ContaPlano) => !sentido || !c.tipo || c.tipo === 'CD' || c.tipo === 'T' || c.tipo === sentido;
  const grupos = new Map<string, ContaPlano[]>();
  for (const c of plano.filter(serve)) { const g = c.grupo ?? 'Plano do escritório'; grupos.set(g, [...(grupos.get(g) ?? []), c]); }
  return <>{[...grupos].map(([g, cs]) => <optgroup key={g} label={g}>{cs.map((c) => <option key={c.codigo} value={c.codigo} title={c.descricao ?? undefined}>{c.nome}</option>)}</optgroup>)}</>;
}
const notaTxt = (l: { nota_fiscal: string | null; sem_nota: boolean }) => (l.nota_fiscal ? `NF ${l.nota_fiscal}` : l.sem_nota ? 'Sem nota' : null);
const CONF = { A: 'Alta', M: 'Média', B: 'Baixa' } as const;
const num = (c: number) => (Math.abs(c) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
type Filtro = { conf: 'revisar' | 'B' | 'M' | 'A' | 'todas' | 'correcao' | 'nota'; tipo: 'todos' | 'C' | 'D'; banco: string; q: string };

export function ConciliacaoTabela({ linhas, plano, bancos, admin, somenteLeitura, bancoInicial }: { linhas: Linha[]; plano: ContaPlano[]; bancos: { id: string; nome: string }[]; admin: boolean; somenteLeitura: boolean; bancoInicial?: string }) {
  const pode = !somenteLeitura; const [motivoCorrecao, setMotivoCorrecao] = useState('');
  const router = useRouter(); const [pend, start] = useTransition();
  // recém-enviado (bancoInicial): abre mostrando TODOS os lançamentos daquele extrato
  const [F, setF] = useState<Filtro>({ conf: bancoInicial ? 'todas' : linhas.some((l) => l.correcao_pedida) ? 'correcao' : 'revisar', tipo: 'todos', banco: bancoInicial ?? 'todos', q: '' });
  const [sel, setSel] = useState<Set<number>>(new Set()); const [aberta, setAberta] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null); const [contaLote, setContaLote] = useState('');
  const rs = useMemo(() => ({ linhas: linhas.length, alta: linhas.filter((l) => l.confianca === 'A').length, media: linhas.filter((l) => l.confianca === 'M').length, baixa: linhas.filter((l) => l.confianca === 'B').length, naoRev: linhas.filter((l) => !l.revisado && l.confianca !== 'A').length, correcoes: linhas.filter((l) => l.correcao_pedida).length }), [linhas]);
  const vis = useMemo(() => {
    const q = norm(F.q);
    return linhas.filter((l) => (F.conf === 'todas' || (F.conf === 'nota' ? !l.nota_fiscal && !l.sem_nota : F.conf === 'correcao' ? l.correcao_pedida : F.conf === 'revisar' ? !l.revisado && l.confianca !== 'A' : l.confianca === F.conf))
      && (F.tipo === 'todos' || (F.tipo === 'C') === l.valor > 0) && (F.banco === 'todos' || l.conta_bancaria_id === F.banco)
      && (!q || norm(`${l.conta_nome ?? ''} ${l.conta_grupo ?? ''} ${l.nota_fiscal ?? ''} ${l.complemento ?? ''} ${l.motivo ?? ''} ${l.observacao ?? ''} ${l.descricao_original} ${num(l.valor)}`).includes(q))).slice(0, 1500);
  }, [linhas, F]);
  const todosMarcados = vis.length > 0 && vis.every((l) => sel.has(l.id));
  const roda = (fn: () => Promise<{ ok: boolean; erro?: string }>, depois?: () => void) => start(async () => { const r = await fn(); if (!r.ok) setErro(r.erro ?? 'Erro'); else { setErro(null); depois?.(); router.refresh(); } });
  const opcoesConta = <OpcoesCategorias plano={plano} />; const faltaNota = linhas.filter((l) => !l.nota_fiscal && !l.sem_nota).length;
  const chip = (val: Filtro['conf'], txt: string, cls: string) => <button key={val} className={`chip ${cls}`} aria-pressed={F.conf === val} onClick={() => setF({ ...F, conf: val })}>{txt}</button>;
  const lote = [...sel];
  return (<>
    {erro && <div className="aviso erro" role="alert">{erro}</div>}
    <div className="painel" style={{ padding: 12 }}>
      <div className="linha-flex">
        {rs.correcoes > 0 && chip('correcao', `Correção pedida (${rs.correcoes})`, 'baixa')}{chip('revisar', `Para revisar (${rs.naoRev})`, 'baixa')}{chip('B', `Baixa (${rs.baixa})`, 'baixa')}{chip('M', `Média (${rs.media})`, 'media')}{chip('A', `Alta (${rs.alta})`, 'alta')}{chip('todas', `Todas (${rs.linhas})`, 'neutro')}{faltaNota > 0 && chip('nota', `Falta nota (${faltaNota})`, 'baixa')}
        {(bancos.length > 1 || bancoInicial) && <select aria-label="Banco" value={F.banco} onChange={(e) => setF({ ...F, banco: e.target.value })} style={{ width: 'auto' }}><option value="todos">Todos os bancos</option>{bancos.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}</select>}
        <select aria-label="Tipo" value={F.tipo} onChange={(e) => setF({ ...F, tipo: e.target.value as Filtro['tipo'] })} style={{ width: 'auto' }}><option value="todos">Recebimentos e pagamentos</option><option value="C">Só recebimentos (entradas)</option><option value="D">Só pagamentos (saídas)</option></select>
        <input type="search" placeholder="Buscar conta, complemento, valor…" aria-label="Buscar" value={F.q} onChange={(e) => setF({ ...F, q: e.target.value })} style={{ width: 'auto', minWidth: 220 }} />
      </div>
      <div className="muted" style={{ fontSize: 13 }}>{vis.length} de {linhas.length} lançamentos{pend && ' · salvando…'}</div>
    </div>
    {pode && sel.size > 0 && <div className="painel" style={{ padding: 12, position: 'sticky', top: 0, zIndex: 5 }}>
      <div className="linha-flex"><strong>{sel.size} selecionado(s)</strong>
        <select aria-label="Conta para classificar" value={contaLote} onChange={(e) => setContaLote(e.target.value)} style={{ width: 'auto', maxWidth: 360 }}><option value="">Escolha a categoria…</option>{opcoesConta}</select>
        <button className="btn pri" disabled={!contaLote || pend} onClick={() => roda(() => acaoClassificarLote(lote, Number(contaLote)), () => setSel(new Set()))}>Classificar e confirmar</button>
        <button className="btn" disabled={pend} onClick={() => roda(() => acaoConfirmarLinhas(lote), () => setSel(new Set()))}>Confirmar (OK) como está</button>
        <button className="btn" disabled={pend} onClick={() => roda(() => acaoSemNota(lote), () => setSel(new Set()))}>Marcar como sem nota</button>
        <button className="btn" onClick={() => setSel(new Set())}>Limpar seleção</button></div>
      {admin && <div className="linha-flex" style={{ marginTop: 8 }}><input type="text" placeholder="O que o cliente precisa corrigir?" value={motivoCorrecao} maxLength={500} onChange={(e) => setMotivoCorrecao(e.target.value)} style={{ flex: 1, minWidth: 240, width: 'auto' }} />
        <button className="btn perigo" disabled={pend || motivoCorrecao.trim().length < 3} onClick={() => roda(() => acaoPedirCorrecao(lote, motivoCorrecao), () => { setSel(new Set()); setMotivoCorrecao(''); })}>Pedir correção</button>
        <button className="btn" disabled={pend} onClick={() => roda(() => acaoLimparCorrecao(lote), () => setSel(new Set()))}>Limpar pedido de correção</button></div>}</div>}
    <div className="rolagem"><table>
      <thead><tr>{pode ? <th style={{ width: 28 }}><input type="checkbox" style={{ width: 'auto' }} aria-label="Selecionar todos os lançamentos visíveis" checked={todosMarcados} onChange={(e) => { const n = new Set(sel); for (const l of vis) e.target.checked ? n.add(l.id) : n.delete(l.id); setSel(n); }} /></th> : null}
        {['Data', 'Categoria', 'Complemento', 'Entrada', 'Saída', 'Nota fiscal', 'Conf.', 'Motivo / observação', ''].map((t, i) => <th key={i} className={i === 3 || i === 4 ? 'r' : ''}>{t}</th>)}</tr></thead>
      <tbody>{vis.map((l) => {
        const ent = l.valor > 0; const cls = [pode ? 'clicavel' : '', l.confianca === 'M' ? 'c-media' : l.confianca === 'B' || l.correcao_pedida ? 'c-baixa' : '', aberta === l.id ? 'aberta' : ''].join(' ');
        const alterna = () => { if (pode) setAberta(aberta === l.id ? null : l.id); };
        return (<Fragment key={l.id}><tr className={cls} tabIndex={0} onClick={alterna} onKeyDown={(e) => { if (e.key === 'Enter') alterna(); }}>
          {pode ? <td onClick={(e) => e.stopPropagation()}><input type="checkbox" style={{ width: 'auto' }} aria-label="Selecionar lançamento" checked={sel.has(l.id)} onChange={(e) => { const n = new Set(sel); e.target.checked ? n.add(l.id) : n.delete(l.id); setSel(n); }} /></td> : null}
          <td className="num">{l.data.slice(8, 10)}/{l.data.slice(5, 7)}</td>
          <td className="conta">{l.conta_codigo != null ? <>{l.conta_grupo && <span className="cod">{l.conta_grupo} › </span>}{l.conta_nome}</> : <><span className="prefixo">REVISAR</span>{ent ? 'Entrada' : 'Saída'} sem categoria</>}</td>
          <td className="comp">{(l.complemento || l.descricao_original).toUpperCase().slice(0, 140)}</td>
          <td className="r num">{ent ? num(l.valor) : ''}</td><td className="r num">{!ent ? num(l.valor) : ''}</td>
          <td className="nota">{notaTxt(l) ?? <span className="falta-nota" title="Informe o número da nota ou marque Sem nota">Falta</span>}</td>
          <td><span className={`chip ${CONF[l.confianca] === 'Alta' ? 'alta' : CONF[l.confianca] === 'Média' ? 'media' : 'baixa'}`}>{CONF[l.confianca]}</span></td>
          <td className="mot">{l.correcao_pedida && <strong style={{ color: 'var(--erro)' }}>Correção pedida: {l.correcao_motivo} </strong>}{[l.motivo, l.observacao].filter(Boolean).join(' ')}</td>
          <td onClick={(e) => e.stopPropagation()}>{!pode ? (l.revisado ? <span className="rev">✓</span> : null) : l.revisado ? <span className="rev" title={`Revisado${l.revisado_por ? ' por ' + l.revisado_por : ''}`}>✓</span> : <button className="btn peq" title="Confirmar esta classificação" disabled={pend || l.conta_codigo == null} onClick={() => roda(() => acaoConfirmarLinhas([l.id]))}>OK</button>}</td></tr>
          {pode && aberta === l.id && <Editor l={l} plano={plano} pend={pend} onSalvar={(d) => roda(() => acaoEditarLinha(l.id, d), () => setAberta(null))} />}</Fragment>);
      })}
      {!vis.length && <tr><td colSpan={pode ? 10 : 9}><div className="vazio">Nenhum lançamento neste filtro.</div></td></tr>}</tbody></table></div>
    <p className="muted" style={{ fontSize: 13, margin: 0 }}>Marque várias linhas (use a busca/filtros e a caixa do cabeçalho para marcar todas) e classifique de uma vez. Clique numa linha para trocar a categoria, o complemento ou informar a nota fiscal. "OK" confirma a classificação e ensina o sistema para os próximos meses deste cliente.</p>
  </>);
}

function Editor({ l, plano, pend, onSalvar }: { l: Linha; plano: ContaPlano[]; pend: boolean; onSalvar: (d: { contaCodigo?: number | null; complemento?: string; observacao?: string; notaFiscal?: string; semNota?: boolean }) => void }) {
  const [conta, setConta] = useState(l.conta_codigo != null ? String(l.conta_codigo) : ''); const [comp, setComp] = useState(l.complemento ?? ''); const [obs, setObs] = useState(l.observacao ?? '');
  const [nota, setNota] = useState(l.nota_fiscal ?? ''); const [semNota, setSemNota] = useState(l.sem_nota);
  const desc = plano.find((c) => String(c.codigo) === conta)?.descricao;
  return (<tr className="editor"><td colSpan={10}>
    <div className="muted" style={{ fontSize: 13 }}>Descrição do banco: <span className="num">{l.descricao_original}</span>{l.documento && <> · doc {l.documento}</>} · {l.banco}</div>
    <div className="ed">
      <label className="campo">Categoria<select value={conta} onChange={(e) => setConta(e.target.value)}><option value="">Sem categoria</option><OpcoesCategorias plano={plano} sentido={l.valor > 0 ? 'C' : 'D'} /></select>{desc && <span className="dica">{desc}</span>}</label>
      <label className="campo">Nº da nota fiscal *<input type="text" value={nota} maxLength={60} disabled={semNota} placeholder={semNota ? 'Sem nota' : 'Ex.: 1234'} onChange={(e) => setNota(e.target.value)} />
        <span className="dica"><label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontWeight: 400 }}><input type="checkbox" style={{ width: 'auto' }} checked={semNota} onChange={(e) => { setSemNota(e.target.checked); if (e.target.checked) setNota(''); }} /> Sem nota</label></span></label>
      <label className="campo">Complemento<input type="text" value={comp} maxLength={300} onChange={(e) => setComp(e.target.value)} /></label>
      <label className="campo">Observação<input type="text" value={obs} maxLength={1000} onChange={(e) => setObs(e.target.value)} /></label></div>
    <div className="linha-flex"><button className="btn pri" disabled={pend} onClick={() => onSalvar({ contaCodigo: conta ? Number(conta) : null, complemento: comp, observacao: obs, notaFiscal: nota.trim(), semNota })}>Salvar</button>
      <span className="muted" style={{ fontSize: 13 }}>Informe o número da nota fiscal ou marque "Sem nota" — é obrigatório para enviar ao escritório.</span></div></td></tr>);
}
