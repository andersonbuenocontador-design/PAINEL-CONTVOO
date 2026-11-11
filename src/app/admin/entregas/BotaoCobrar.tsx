'use client';
// "Cobrar envio": registra a cobrança no painel do cliente e, se a empresa tem WhatsApp, abre o WhatsApp (celular ou WhatsApp Web)
// já na conversa dele com a mensagem pronta — é só apertar enviar.
import { acaoCobrarDocumentos } from '../docs-actions';

export function BotaoCobrar({ empresaId, competencia, rotulo, whatsapp, mensagem }: { empresaId: string; competencia: string; rotulo: string; whatsapp?: string | null; mensagem?: string }) {
  const link = whatsapp && mensagem ? `https://wa.me/${whatsapp}?text=${encodeURIComponent(mensagem)}` : null;
  return (<form action={acaoCobrarDocumentos} onSubmit={() => { if (link) window.open(link, '_blank', 'noopener'); }}>
    <input type="hidden" name="empresaId" value={empresaId} /><input type="hidden" name="competencia" value={competencia} />
    <button className="ent-btn cobrar" title={link ? 'Registra a cobrança no painel e abre o WhatsApp com a mensagem pronta' : 'Registra a cobrança no painel do cliente. Cadastre o WhatsApp da empresa para cobrar também pelo WhatsApp.'}>
      {link && <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 5 }}><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.6-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2s.2-1.1.2-1.2-.2-.2-.5-.3z" /></svg>}
      {rotulo}</button>
  </form>);
}
