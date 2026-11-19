'use client';
// Mensagem de cobrança: o escritório escreve o texto com marcadores e vê na hora como chega no WhatsApp do cliente.
import { useRef, useState } from 'react';
import { EXEMPLO, MARCADORES, MENSAGEM_PADRAO, TAMANHO_MAX_MENSAGEM, montarMensagem } from '@/lib/mensagem-cobranca';
import { acaoMensagemPadrao, acaoSalvarMensagem } from './actions';

export function EditorMensagem({ inicial, personalizada }: { inicial: string; personalizada: boolean }) {
  const [texto, setTexto] = useState(inicial); const area = useRef<HTMLTextAreaElement>(null);
  const inserir = (m: string) => {
    const el = area.current; if (!el) return setTexto((t) => t + m);
    const a = el.selectionStart, b = el.selectionEnd; const novo = texto.slice(0, a) + m + texto.slice(b); setTexto(novo);
    requestAnimationFrame(() => { el.focus(); el.selectionStart = el.selectionEnd = a + m.length; });
  };
  return (<div className="msg-editor">
    <form action={acaoSalvarMensagem} className="msg-editor-campo">
      <label htmlFor="texto">Texto da mensagem</label>
      <textarea id="texto" name="texto" ref={area} rows={12} maxLength={TAMANHO_MAX_MENSAGEM} value={texto} onChange={(e) => setTexto(e.target.value)} />
      <div className="msg-marcadores"><span className="soon">Clique para inserir:</span>{MARCADORES.map((m) => <button type="button" key={m.chave} className="msg-chip" title={m.explica} onClick={() => inserir(m.chave)}>{m.chave}</button>)}</div>
      <ul className="soon msg-legenda">{MARCADORES.map((m) => <li key={m.chave}><code>{m.chave}</code> {m.explica}</li>)}</ul>
      <div className="row"><button>Salvar mensagem</button>
        {texto !== MENSAGEM_PADRAO && <button type="button" className="sec" onClick={() => setTexto(MENSAGEM_PADRAO)}>Ver o texto padrão</button>}
        <span className="soon">{texto.length}/{TAMANHO_MAX_MENSAGEM}</span></div>
    </form>
    <div className="msg-previa"><span className="soon">Como chega no WhatsApp (exemplo):</span>
      <div className="msg-balao">{montarMensagem(texto, EXEMPLO)}</div>
      {personalizada && <form action={acaoMensagemPadrao}><button className="link-perigo">Voltar ao texto padrão</button></form>}</div>
  </div>);
}
