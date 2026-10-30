'use client';
// Conciliação guiada: um lançamento por vez, sugestão em destaque, confirmação em um clique ou tecla, pergunta da nota logo em
// seguida, progresso visível, metas pequenas e pausa sugerida. Cada resposta é salva na hora (o cliente pode parar quando quiser).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { acaoClassificarLote, acaoConfirmarLinhas, acaoEditarLinha, acaoSemNota } from './conciliacao-actions';
import type { ContaPlano, Linha } from './ConciliacaoTabela';

const brl = (c: number) => (Math.abs(c) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const ICONE: Record<string, string> = { 'Receitas': '💰', 'Compras e mercadorias': '🛒', 'Despesas da empresa': '🏢', 'Funcionários e folha': '👥', 'Impostos e taxas': '🧾', 'Transporte e viagens': '🚗', 'Despesas financeiras': '🏦', 'Bens e investimentos': '💻', 'Sócios e transferências': '🤝', 'Outras movimentações': '📌' };
// categorias mais comuns, para os botões de escolha rápida (completam o que o cliente já usou no mês)
const COMUNS = { C: ['Recebimento de clientes', 'Venda de produtos', 'Prestação de serviços', 'Transferência recebida de conta própria', 'Dinheiro colocado pelo sócio', 'Outras entradas'], D: ['Compra de mercadorias para revenda', 'Materiais de uso e consumo', 'Combustível', 'Retirada de dinheiro pelo sócio', 'Dinheiro enviado para outra conta da empresa', 'Outras despesas da empresa'] };
const CONQUISTAS = [{ n: 5, t: 'Primeiros passos' }, { n: 20, t: 'Ritmo de organização' }];
type Etapa = 'categoria' | 'nota';
type Feito = { id: number; antes: Pick<Linha, 'conta_codigo' | 'conta_nome' | 'conta_grupo' | 'revisado' | 'nota_fiscal' | 'sem_nota'> };

export function ConciliacaoGuiada({ linhas: inicial, plano, mes, onVerTabela, onEnviar, podeEnviar, primeiroBanco }: { linhas: Linha[]; plano: ContaPlano[]; mes: string; onVerTabela: () => void; onEnviar?: React.ReactNode; podeEnviar: boolean; primeiroBanco?: string }) {
  const router = useRouter();
  const [linhas, setLinhas] = useState(inicial);
  useEffect(() => setLinhas(inicial), [inicial]);
  const naoSei = plano.find((c) => c.nome === 'Não sei identificar');
  const precisaCategoria = (l: Linha) => !l.revisado || l.correcao_pedida;
  const precisaNota = (l: Linha) => !l.nota_fiscal && !l.sem_nota;
  // fila inteligente (fixada ao abrir, para os cartões não pularem): correção pedida → sugestões fáceis → sem sugestão → só falta a nota
  const [fila] = useState(() => {
    // extrato recém-anexado (primeiroBanco) vem antes dos demais
    const peso = (l: Linha) => (l.correcao_pedida ? 0 : precisaCategoria(l) && l.conta_codigo != null ? 1 : precisaCategoria(l) ? 2 : 3) + (primeiroBanco && l.conta_bancaria_id !== primeiroBanco ? 10 : 0);
    return inicial.filter((l) => precisaCategoria(l) || precisaNota(l)).sort((a, b) => peso(a) - peso(b) || a.data.localeCompare(b.data) || a.id - b.id).map((l) => l.id);
  });
  const [pos, setPos] = useState(0); const [etapa, setEtapa] = useState<Etapa>('categoria');
  const [escolhendo, setEscolhendo] = useState(false); const [nota, setNota] = useState('');
  const [erro, setErro] = useState<string | null>(null); const [salvando, setSalvando] = useState(false);
  const [feitosSessao, setFeitosSessao] = useState(0); const [aviso, setAviso] = useState<string | null>(null); const [pausa, setPausa] = useState(false);
  const historico = useRef<Feito[]>([]);
  const porId = useMemo(() => new Map(linhas.map((l) => [l.id, l])), [linhas]);
  const atual = fila[pos] != null ? porId.get(fila[pos]) : undefined;
  const total = linhas.length; const prontas = linhas.filter((l) => !precisaCategoria(l) && !precisaNota(l)).length;
  const classificadas = linhas.filter((l) => !precisaCategoria(l)).length;
  const pct = total ? Math.round((prontas / total) * 1000) / 10 : 100;

  useEffect(() => { if (atual) { setEtapa(precisaCategoria(atual) ? 'categoria' : 'nota'); setNota(atual.nota_fiscal ?? ''); setEscolhendo(false); } }, [atual?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const atualiza = (id: number, d: Partial<Linha>) => setLinhas((ls) => ls.map((l) => (l.id === id ? { ...l, ...d } : l)));
  const salvar = async (fn: () => Promise<{ ok: boolean; erro?: string }>) => { setSalvando(true); const r = await fn(); setSalvando(false); if (!r.ok) { setErro(r.erro ?? 'Não foi possível salvar.'); return false; } setErro(null); return true; };
  const avancar = useCallback(() => {
    const n = feitosSessao + 1; setFeitosSessao(n);
    const faltam = linhas.filter((l) => precisaCategoria(l) || precisaNota(l)).length - 1;
    if (n % 20 === 0 && faltam > 0) setPausa(true);
    else if (n % 5 === 0 && faltam > 0) setAviso(`Muito bem! Você concluiu mais 5 movimentações. ${faltam > 0 ? `Faltam ${faltam}.` : ''}`);
    setPos((p) => p + 1);
  }, [feitosSessao, linhas]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!aviso) return; const t = setTimeout(() => setAviso(null), 3500); return () => clearTimeout(t); }, [aviso]);

  const guardar = (l: Linha) => historico.current.push({ id: l.id, antes: { conta_codigo: l.conta_codigo, conta_nome: l.conta_nome, conta_grupo: l.conta_grupo, revisado: l.revisado, nota_fiscal: l.nota_fiscal, sem_nota: l.sem_nota } });
  const depoisDaCategoria = (l: Linha) => { if (precisaNota(l)) setEtapa('nota'); else avancar(); };
  const confirmar = async () => {
    if (!atual || atual.conta_codigo == null) return;
    guardar(atual);
    if (await salvar(() => acaoConfirmarLinhas([atual.id]))) { atualiza(atual.id, { revisado: true, correcao_pedida: false, confianca: 'A' }); depoisDaCategoria(atual); }
  };
  const escolher = async (c: ContaPlano, iguais: number[] = []) => {
    if (!atual) return; guardar(atual);
    const ids = [atual.id, ...iguais];
    if (await salvar(() => acaoClassificarLote(ids, c.codigo))) {
      for (const id of ids) atualiza(id, { conta_codigo: c.codigo, conta_nome: c.nome, conta_grupo: c.grupo ?? null, revisado: true, correcao_pedida: false, confianca: 'A' });
      if (iguais.length) setAviso(`Categoria aplicada também a ${iguais.length} lançamento(s) iguais.`);
      setEscolhendo(false); depoisDaCategoria(atual);
    }
  };
  const salvarNota = async (semNota: boolean) => {
    if (!atual) return;
    const n = nota.trim(); if (!semNota && !n) { setErro('Digite o número da nota ou clique em "Sem nota".'); return; }
    guardar(atual);
    if (await salvar(() => (semNota ? acaoSemNota([atual.id]) : acaoEditarLinha(atual.id, { notaFiscal: n, semNota: false, complemento: atual.complemento ?? '', observacao: atual.observacao ?? '' })))) {
      atualiza(atual.id, { nota_fiscal: semNota ? null : n, sem_nota: semNota }); avancar();
    }
  };
  const pular = () => { setErro(null); setPos((p) => Math.min(p + 1, fila.length)); };
  const voltar = () => { setErro(null); setPos((p) => Math.max(0, p - 1)); };
  const terminar = () => router.refresh();

  // lançamentos iguais (mesma descrição normalizada e mesmo sentido) ainda sem categoria: oferece aplicar a todos de uma vez
  const iguais = atual ? linhas.filter((l) => l.id !== atual.id && l.chave && l.chave === atual.chave && (l.valor > 0) === (atual.valor > 0) && precisaCategoria(l)).map((l) => l.id) : [];
  const sentido: 'C' | 'D' = atual && atual.valor > 0 ? 'C' : 'D';
  const servem = plano.filter((c) => !c.tipo || c.tipo === 'CD' || c.tipo === 'T' || c.tipo === sentido);
  const usadas = [...new Map(linhas.filter((l) => l.revisado && l.conta_codigo != null && (l.valor > 0) === (sentido === 'C')).map((l) => [l.conta_codigo!, 1])).keys()];
  const rapidas = [...new Set([...usadas.map((c) => servem.find((p) => p.codigo === c)).filter(Boolean) as ContaPlano[], ...COMUNS[sentido].map((n) => servem.find((p) => p.nome === n)).filter(Boolean) as ContaPlano[]])]
    .filter((c) => c.codigo !== atual?.conta_codigo && c.codigo !== naoSei?.codigo).slice(0, 6);

  // atalhos de teclado
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!atual || pausa || salvando) return;
      const el = e.target as HTMLElement; const digitando = el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA';
      if (e.key === 'Enter' && etapa === 'nota' && el.tagName === 'INPUT') { e.preventDefault(); void salvarNota(false); return; }
      if (etapa === 'nota' && el.classList.contains('nota-input') && e.key.toLowerCase() === 's' && !nota.trim()) { e.preventDefault(); void salvarNota(true); return; }
      if (etapa === 'nota' && el.classList.contains('nota-input') && e.key === 'ArrowRight' && !nota.trim()) { e.preventDefault(); pular(); return; }
      if (digitando) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); voltar(); return; }
      if (e.key === 'ArrowRight') { e.preventDefault(); pular(); return; }
      if (e.key === 'ArrowLeft') { e.preventDefault(); voltar(); return; }
      if (etapa === 'categoria') {
        if (e.key === 'Enter' && atual.conta_codigo != null) { e.preventDefault(); void confirmar(); }
        else if (/^[1-6]$/.test(e.key) && rapidas[Number(e.key) - 1]) { e.preventDefault(); void escolher(rapidas[Number(e.key) - 1]); }
        else if (e.key.toLowerCase() === 'n' && naoSei) { e.preventDefault(); void escolher(naoSei); }
        else if (e.key.toLowerCase() === 'a') { e.preventDefault(); setEscolhendo(true); }
      } else if (e.key.toLowerCase() === 's') { e.preventDefault(); void salvarNota(true); }
    };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  });

  const conquistas = [...CONQUISTAS.filter((c) => feitosSessao >= c.n).map((c) => c.t), ...(pct >= 80 && pct < 100 ? ['Quase lá'] : []), ...(pct === 100 ? ['Mês organizado'] : [])];
  const nomeMes = new Date(`${mes}-15T12:00:00Z`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });

  return (<div className="guiada">
    <div className="guiada-topo">
      <div><h2>Vamos organizar as movimentações de {nomeMes}</h2>
        <p className="muted">{total} movimentações · {classificadas} com categoria · {prontas} prontas (categoria e nota) · faltam {total - prontas}</p></div>
      <button className="btn" onClick={onVerTabela}>Ver em tabela</button>
    </div>
    <div className="progresso" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progresso da conciliação"><div style={{ width: `${pct}%` }} /></div>
    <div className="guiada-meta"><strong>{pct.toLocaleString('pt-BR')}% concluído</strong>{atual && <span>🎯 Próxima meta: mais {5 - (feitosSessao % 5)} movimentação(ões)</span>}
      {conquistas.map((c) => <span key={c} className="conquista">🏆 {c}</span>)}</div>
    {aviso && <div className="aviso info guiada-aviso" role="status">{aviso}</div>}
    {erro && <div className="aviso erro" role="alert">{erro}</div>}

    {pausa ? (<div className="cartao-guiado pausa">
      <h3>🎉 Você já organizou {feitosSessao} movimentações!</h3><p>Quer continuar agora ou fazer uma pausa? <strong>Seu progresso está salvo.</strong></p>
      <div className="linha-flex"><button className="btn pri" onClick={() => setPausa(false)} autoFocus>Continuar</button><button className="btn" onClick={terminar}>Pausar e voltar depois</button></div></div>)
    : !atual ? (<div className="cartao-guiado fim">
      <h3>{linhas.some((l) => precisaCategoria(l) || precisaNota(l)) ? 'Você passou por todos os lançamentos desta rodada.' : '✅ Tudo pronto! Todas as movimentações têm categoria e nota.'}</h3>
      {linhas.some((l) => precisaCategoria(l) || precisaNota(l)) ? <p>Alguns ficaram para depois. <button className="btn" onClick={() => { setPos(0); router.refresh(); }}>Recomeçar pelos que faltam</button></p>
        : podeEnviar ? <><p>Agora é só enviar ao escritório para a conferência.</p>{onEnviar}</> : null}</div>)
    : (<div className="cartao-guiado" key={atual.id}>
      <div className="guiada-contador">Movimentação {pos + 1} de {fila.length} · {atual.data.split('-').reverse().join('/')} · {atual.banco}
        {atual.correcao_pedida && <span className="tag-correcao">O escritório pediu correção: {atual.correcao_motivo}</span>}</div>
      <p className="guiada-frase">{atual.valor > 0 ? 'Você recebeu' : 'Você pagou'} <strong className={atual.valor > 0 ? 'val-ent' : 'val-sai'}>{brl(atual.valor)}</strong></p>
      <p className="guiada-desc">{atual.descricao_original}</p>

      {etapa === 'categoria' ? (<>
        {atual.conta_codigo != null && !escolhendo && (<div className="sugestao">
          <div><span className="muted">{atual.revisado ? 'Categoria escolhida' : 'Sugestão'}</span><strong>{ICONE[atual.conta_grupo ?? ''] ?? '📌'} {atual.conta_nome}</strong>{atual.conta_grupo && <span className="muted">{atual.conta_grupo}</span>}
            {!atual.revisado && atual.motivo && <span className="muted motivo">{atual.motivo}</span>}</div>
          <div className="linha-flex"><button className="btn pri grande" disabled={salvando} onClick={() => void confirmar()} autoFocus>✓ Confirmar <kbd>Enter</kbd></button>
            <button className="btn" onClick={() => setEscolhendo(true)}>Alterar <kbd>A</kbd></button></div></div>)}
        {(atual.conta_codigo == null || escolhendo) && <p className="guiada-pergunta">{atual.valor > 0 ? 'De onde veio esse dinheiro?' : 'O que foi esse pagamento?'}</p>}
        <div className="rapidas">{rapidas.map((c, i) => <button key={c.codigo} className="btn rapida" disabled={salvando} onClick={() => void escolher(c)} title={c.descricao ?? undefined}><kbd>{i + 1}</kbd> {ICONE[c.grupo ?? ''] ?? '📌'} {c.nome}</button>)}
          {naoSei && <button className="btn rapida nao-sei" disabled={salvando} onClick={() => void escolher(naoSei)} title="O escritório vai revisar este lançamento"><kbd>N</kbd> ❓ Não sei identificar</button>}</div>
        <label className="campo outra">Outra categoria
          <select value="" onChange={(e) => { const c = servem.find((p) => String(p.codigo) === e.target.value); if (c) void escolher(c); }}>
            <option value="">Procurar na lista completa…</option>
            {[...new Map(servem.map((c) => [c.grupo ?? 'Plano do escritório', 1])).keys()].map((g) => <optgroup key={g} label={`${ICONE[g] ?? ''} ${g}`}>{servem.filter((c) => (c.grupo ?? 'Plano do escritório') === g).map((c) => <option key={c.codigo} value={c.codigo}>{c.nome}</option>)}</optgroup>)}
          </select></label>
        {iguais.length > 0 && atual.conta_codigo != null && <p><button className="btn" disabled={salvando} onClick={() => void escolher(servem.find((c) => c.codigo === atual.conta_codigo) ?? { codigo: atual.conta_codigo!, nome: atual.conta_nome ?? '', classificacao: '' }, iguais)}>Confirmar este e mais {iguais.length} lançamento(s) iguais</button></p>}
      </>) : (<div className="nota-passo">
        <p className="guiada-pergunta">✓ {atual.conta_nome}. <span>Esse lançamento tem nota fiscal?</span></p>
        <div className="linha-flex"><input type="text" className="nota-input" value={nota} maxLength={60} placeholder="Número da nota (ex.: 1234)" onChange={(e) => setNota(e.target.value)} autoFocus style={{ maxWidth: 260 }} />
          <button className="btn pri" disabled={salvando} onClick={() => void salvarNota(false)}>Salvar número <kbd>Enter</kbd></button>
          <button className="btn" disabled={salvando} onClick={() => void salvarNota(true)}>Sem nota <kbd>S</kbd></button>
          <button className="btn link" onClick={pular}>Responder depois <kbd>→</kbd></button></div></div>)}

      <div className="guiada-rodape"><button className="btn link" onClick={voltar} disabled={pos === 0}>← Anterior <kbd>Ctrl+Z</kbd></button><span className="muted">Salvo automaticamente a cada resposta</span><button className="btn link" onClick={pular}>Pular <kbd>→</kbd></button></div>
    </div>)}
  </div>);
}
