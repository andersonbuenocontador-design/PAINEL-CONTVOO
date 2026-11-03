'use client';
// Cliente ou fornecedor do lançamento: lista dos já cadastrados + botão "+" para cadastrar na hora
// (o nome e o CPF/CNPJ vêm sugeridos a partir da descrição do banco).
import { useState } from 'react';
import { acaoCriarParticipante } from './conciliacao-actions';

export type Participante = { id: string; tipo: 'cliente' | 'fornecedor'; nome: string; documento: string | null };
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const PREFIXOS = /^(PAGAMENTO|PAGTO|PAG|PIX|TED|DOC|TRANSF\w*|TRANSFERENCIA|RECEBIMENTO|RECEBIDO|ENVIADO|ENVIADA|RECEBIDA|BOLETO|COMPRA|DEBITO|CREDITO|CARTAO|TARIFA|\s|-|\/)+/;

/** Sugestão de nome e CPF/CNPJ a partir da descrição do banco (ex.: "PAGAMENTO PIX - BORRACHARIA TRES PO / 05.966.876/0001-00"). */
export function sugerirParticipante(descricao: string) {
  const doc = (descricao.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}|\d{3}\.\d{3}\.\d{3}-\d{2}/)?.[0] ?? '').replace(/\D/g, '');
  const partes = descricao.split(/\s+-\s+/);
  let nome = (partes.length > 1 ? partes.slice(1).join(' - ') : descricao).split(/\s+\/\s+|\s+DOC\.?:/i)[0];
  nome = nome.replace(PREFIXOS, '').replace(/\s+/g, ' ').trim();
  return { nome: nome.length >= 2 ? nome.slice(0, 120) : '', documento: doc.length === 11 || doc.length === 14 ? doc : '' };
}
/** Já cadastrado? Procura pelo CPF/CNPJ da descrição ou pelo nome contido nela. */
export function acharParticipante(descricao: string, lista: Participante[], tipo: 'cliente' | 'fornecedor') {
  const d = norm(descricao); const digitos = descricao.replace(/\D/g, '');
  const doTipo = lista.filter((p) => p.tipo === tipo);
  return doTipo.find((p) => p.documento && digitos.includes(p.documento)) ?? doTipo.find((p) => norm(p.nome).length >= 4 && d.includes(norm(p.nome)));
}
const fmtDoc = (d: string | null) => (!d ? '' : d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4'));

export function CampoParticipante({ empresaId, tipo, lista, valor, descricao, onEscolher, onCriado, abrirNovo }: {
  empresaId: string; tipo: 'cliente' | 'fornecedor'; lista: Participante[]; valor: string | null; descricao: string;
  onEscolher: (id: string | null) => void; onCriado: (p: Participante) => void; abrirNovo?: boolean;
}) {
  const [novo, setNovo] = useState(!!abrirNovo); const sug = sugerirParticipante(descricao);
  const [nome, setNome] = useState(sug.nome); const [doc, setDoc] = useState(fmtDoc(sug.documento));
  const [erro, setErro] = useState<string | null>(null); const [salvando, setSalvando] = useState(false);
  const doTipo = lista.filter((p) => p.tipo === tipo); const rotulo = tipo === 'cliente' ? 'cliente' : 'fornecedor';
  const salvar = async () => {
    setSalvando(true); setErro(null);
    const r = await acaoCriarParticipante(empresaId, { tipo, nome, documento: doc });
    setSalvando(false);
    if (!r.ok) { setErro(r.erro); return; }
    onCriado(r.participante); onEscolher(r.participante.id); setNovo(false);
  };
  return (<div className="participante">
    <div className="participante-linha">
      <select value={valor ?? ''} onChange={(e) => onEscolher(e.target.value || null)} aria-label={`Escolher ${rotulo}`}>
        <option value="">{doTipo.length ? `Escolha o ${rotulo}…` : `Nenhum ${rotulo} cadastrado`}</option>
        {doTipo.map((p) => <option key={p.id} value={p.id}>{p.nome}{p.documento ? ` · ${fmtDoc(p.documento)}` : ''}</option>)}
      </select>
      <button type="button" className="btn mais" onClick={() => setNovo((v) => !v)} aria-expanded={novo} title={`Cadastrar novo ${rotulo}`} aria-label={`Cadastrar novo ${rotulo}`}>+</button>
    </div>
    {novo && (<div className="participante-novo" role="group" aria-label={`Novo ${rotulo}`}>
      <label className="campo">Nome do {rotulo} *<input type="text" value={nome} maxLength={120} autoFocus onChange={(e) => setNome(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); void salvar(); } }} /></label>
      <label className="campo">CPF ou CNPJ (opcional)<input type="text" inputMode="numeric" value={doc} maxLength={18} onChange={(e) => setDoc(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); void salvar(); } }} /></label>
      <div className="linha-flex"><button type="button" className="btn pri" disabled={salvando || nome.trim().length < 2} onClick={() => void salvar()}>{salvando ? 'Salvando…' : `Cadastrar ${rotulo}`}</button>
        <button type="button" className="btn link" onClick={() => setNovo(false)}>Cancelar</button></div>
      {erro && <span className="falta-nota" role="alert">{erro}</span>}
    </div>)}
  </div>);
}

/** Versão compacta para ficar ao lado da categoria: só o botão "+"; ele abre a escolha/cadastro do cliente ou fornecedor. */
export function MaisParticipante({ empresaId, tipo, lista, valor, descricao, onEscolher, onCriado }: {
  empresaId: string; tipo: 'cliente' | 'fornecedor'; lista: Participante[]; valor: string | null; descricao: string;
  onEscolher: (id: string | null) => void; onCriado: (p: Participante) => void;
}) {
  const [aberto, setAberto] = useState(false); const rotulo = tipo === 'cliente' ? 'cliente' : 'fornecedor';
  const doTipo = lista.filter((p) => p.tipo === tipo); const sugerido = acharParticipante(descricao, lista, tipo);
  return (<span className="mais-part">
    <button type="button" className="btn mais" onClick={() => setAberto((v) => !v)} aria-expanded={aberto} title={`Cadastrar ou escolher o ${rotulo}`} aria-label={`Cadastrar ou escolher o ${rotulo}`}>+</button>
    {aberto && (<div className="mais-pop" role="dialog" aria-label={`${rotulo} do lançamento`}>
      <strong>{tipo === 'cliente' ? 'Cliente' : 'Fornecedor'} deste lançamento</strong>
      {sugerido && sugerido.id !== valor && <button type="button" className="btn pri" onClick={() => { onEscolher(sugerido.id); setAberto(false); }}>Usar {sugerido.nome}</button>}
      {doTipo.length > 0 && <select value={valor ?? ''} aria-label={`Escolher ${rotulo} já cadastrado`} onChange={(e) => { onEscolher(e.target.value || null); setAberto(false); }}>
        <option value="">Escolher um já cadastrado…</option>{doTipo.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select>}
      <NovoParticipante empresaId={empresaId} tipo={tipo} descricao={descricao} onCriado={(p) => { onCriado(p); onEscolher(p.id); setAberto(false); }} onCancelar={() => setAberto(false)} />
    </div>)}
  </span>);
}
function NovoParticipante({ empresaId, tipo, descricao, onCriado, onCancelar }: { empresaId: string; tipo: 'cliente' | 'fornecedor'; descricao: string; onCriado: (p: Participante) => void; onCancelar: () => void }) {
  const sug = sugerirParticipante(descricao); const rotulo = tipo === 'cliente' ? 'cliente' : 'fornecedor';
  const [nome, setNome] = useState(sug.nome); const [doc, setDoc] = useState(fmtDoc(sug.documento));
  const [erro, setErro] = useState<string | null>(null); const [salvando, setSalvando] = useState(false);
  const salvar = async () => {
    setSalvando(true); setErro(null); const r = await acaoCriarParticipante(empresaId, { tipo, nome, documento: doc }); setSalvando(false);
    if (r.ok) onCriado(r.participante); else setErro(r.erro);
  };
  const enter = (e: React.KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); void salvar(); } };
  return (<div className="participante-novo">
    <label className="campo">Novo {rotulo}: nome *<input type="text" value={nome} maxLength={120} autoFocus onChange={(e) => setNome(e.target.value)} onKeyDown={enter} /></label>
    <label className="campo">CPF ou CNPJ (opcional)<input type="text" inputMode="numeric" value={doc} maxLength={18} onChange={(e) => setDoc(e.target.value)} onKeyDown={enter} /></label>
    <div className="linha-flex"><button type="button" className="btn pri" disabled={salvando || nome.trim().length < 2} onClick={() => void salvar()}>{salvando ? 'Salvando…' : `Cadastrar ${rotulo}`}</button>
      <button type="button" className="btn link" onClick={onCancelar}>Cancelar</button></div>
    {erro && <span className="falta-nota" role="alert">{erro}</span>}
  </div>);
}
