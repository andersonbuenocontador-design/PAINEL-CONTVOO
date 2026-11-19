'use client';
// Botão de envio em massa: pede confirmação e avisa que está enviando (o servidor também impede envio duplicado).
import { useState } from 'react';

export function BotaoConfirmar({ texto, pergunta, classe = 'doc2-btn primario', desabilitado = false }: { texto: string; pergunta: string; classe?: string; desabilitado?: boolean }) {
  const [enviando, setEnviando] = useState(false);
  return <button className={classe} disabled={desabilitado} aria-busy={enviando}
    onClick={(e) => { if (enviando || !window.confirm(pergunta)) { e.preventDefault(); return; } setEnviando(true); }}>{enviando ? 'Enviando… não feche a página' : texto}</button>;
}
