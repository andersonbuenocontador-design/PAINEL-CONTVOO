'use client';
// Configuração da "Solicitação de documentos": código do sistema no G-Click, usuário, nome da tarefa e a mensagem padrão do WhatsApp (com prévia).
import { useRef, useState } from 'react';
import { EXEMPLO_SOLICITACAO, MARCADORES_SOLICITACAO, SOLICITACAO_PADRAO, montarSolicitacao } from '@/lib/mensagem-solicitacao';
import { acaoSalvarConfigSolicitacao } from './actions';

type Cfg = { sistema: string; usuario: string; tarefa: string; motivoSemEmail: string; mensagem: string; mensagemPersonalizada: boolean };
export function EditorSolicitacao({ cfg, competencia }: { cfg: Cfg; competencia: string }) {
  const [texto, setTexto] = useState(cfg.mensagem); const area = useRef<HTMLTextAreaElement>(null);
  const inserir = (m: string) => {
    const el = area.current; if (!el) return setTexto((t) => t + m);
    const a = el.selectionStart, b = el.selectionEnd; setTexto(texto.slice(0, a) + m + texto.slice(b));
    requestAnimationFrame(() => { el.focus(); el.selectionStart = el.selectionEnd = a + m.length; });
  };
  return (<form action={acaoSalvarConfigSolicitacao} className="emp-form">
    <input type="hidden" name="competencia" value={competencia} />
    <div className="grid">
      <div><label htmlFor="tarefa">Nome da tarefa no G-Click *</label><input id="tarefa" name="tarefa" required defaultValue={cfg.tarefa} /></div>
      <div><label htmlFor="sistema">Código do &quot;sistema&quot; de integração</label><input id="sistema" name="sistema" defaultValue={cfg.sistema} autoComplete="off" placeholder="G-Click → Configurações → Minha empresa → Sistemas de Integração" /></div>
      <div><label htmlFor="usuario">Usuário que aparece no G-Click</label><input id="usuario" name="usuario" defaultValue={cfg.usuario} placeholder="gclickbot" /></div>
      <div><label htmlFor="motivoSemEmail">Motivo do X (quem não tem e-mail)</label><input id="motivoSemEmail" name="motivoSemEmail" maxLength={200} defaultValue={cfg.motivoSemEmail} /></div>
    </div>
    <p className="soon">O ✔ pela API é um recurso &quot;para parceiros&quot; do G-Click: ele pede o código do sistema de integração cadastrado no G-Click. Sem esse código, o botão do e-mail fica travado.</p>
    <div className="msg-editor">
      <div className="msg-editor-campo">
        <label htmlFor="mensagem">Mensagem padrão do WhatsApp (para quem não tem e-mail)</label>
        <textarea id="mensagem" name="mensagem" ref={area} rows={11} maxLength={1500} value={texto} onChange={(e) => setTexto(e.target.value)} />
        <div className="msg-marcadores"><span className="soon">Clique para inserir:</span>{MARCADORES_SOLICITACAO.map((m) => <button type="button" key={m.chave} className="msg-chip" title={m.explica} onClick={() => inserir(m.chave)}>{m.chave}</button>)}</div>
        <ul className="soon msg-legenda">{MARCADORES_SOLICITACAO.map((m) => <li key={m.chave}><code>{m.chave}</code> {m.explica}</li>)}</ul>
        <div className="row"><button>Salvar configuração</button>
          {texto !== SOLICITACAO_PADRAO && <button type="button" className="sec" onClick={() => setTexto(SOLICITACAO_PADRAO)}>Voltar ao texto padrão</button>}
          <span className="soon">{texto.length}/1500</span></div>
      </div>
      <div className="msg-previa"><span className="soon">Como chega no WhatsApp (exemplo):</span><div className="msg-balao">{montarSolicitacao(texto, EXEMPLO_SOLICITACAO)}</div></div>
    </div>
  </form>);
}
