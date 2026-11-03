'use client';
// Abre o WhatsApp com a mensagem de cobrança pronta (wa.me) e registra a cobrança no painel do cliente.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { acaoCobrarWhatsApp } from '../docs-actions';

export function CobrarWhatsApp({ empresaId, competencia, rotulo }: { empresaId: string; competencia: string; rotulo: string }) {
  const router = useRouter(); const [enviando, setEnviando] = useState(false); const [erro, setErro] = useState<string | null>(null);
  const cobrar = async () => {
    setEnviando(true); setErro(null);
    const janela = window.open('', '_blank'); // aberta já no clique, para o navegador não bloquear
    const r = await acaoCobrarWhatsApp(empresaId, competencia); setEnviando(false);
    if (r.ok) { if (janela) { janela.opener = null; janela.location.href = r.url; } else window.location.href = r.url; router.refresh(); }
    else { janela?.close(); setErro(r.erro); }
  };
  return (<><button type="button" className="danger" disabled={enviando} onClick={() => void cobrar()} title="Abre o WhatsApp com a mensagem pronta e registra a cobrança no painel do cliente">{enviando ? 'Abrindo o WhatsApp…' : `${rotulo} (WhatsApp)`}</button>
    {erro && <span className="msg-err-inline" role="alert">{erro}</span>}</>);
}
