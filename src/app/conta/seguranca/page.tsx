import { redirect } from 'next/navigation';
import QRCode from 'qrcode';
import { mfaDisponivel, usuarioAtual } from '@/lib/session';
import { segredoPendente, statusMfa } from '@/lib/services/seguranca';
import { Avisos, Topo } from '../../components';
import { acaoIniciarMfa } from '../../seguranca-actions';
import { MfaForm } from './MfaForm';

export default async function Seguranca({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string; obrigatorio?: string }> }) {
  const u = await usuarioAtual(); if (!u) redirect('/login'); if (u.deve_trocar_senha) redirect('/trocar-senha'); if (!mfaDisponivel(u)) redirect('/cliente');
  const sp = await searchParams; const st = await statusMfa(u.id); const pend = st.pendente ? await segredoPendente(u.id) : null;
  const qr = pend ? await QRCode.toString(pend.uri, { type: 'svg', margin: 1, width: 220 }) : null;
  return (<><Topo u={u} /><main><h1>Segurança da conta</h1><Avisos erro={sp.erro} ok={sp.ok} />
    {sp.obrigatorio && !st.ativo && <div className="msg-err">O escritório exige a verificação em duas etapas para administradores. Ative abaixo para continuar.</div>}
    <div className="card"><h2>Verificação em duas etapas</h2>
      {st.ativo ? <p>✅ Ativa. Códigos de recuperação restantes: <strong>{st.codigosRestantes}</strong>. Para desativar ou trocar de celular, peça ao escritório para redefinir.</p> : (<>
        <p className="soon">Além da senha, o login passa a pedir um código de 6 dígitos de um aplicativo (Google Authenticator, Microsoft Authenticator, Authy…). Protege sua conta mesmo se a senha vazar.</p>
        {!pend ? <form action={acaoIniciarMfa}><button>Configurar</button></form> : (<>
          <ol><li>No aplicativo autenticador, escolha "adicionar conta" e escaneie o QR code (ou digite a chave).</li><li>Digite abaixo o código de 6 dígitos que o aplicativo mostrar.</li></ol>
          <div dangerouslySetInnerHTML={{ __html: qr! }} /><p className="soon">Chave manual: <code>{pend.segredo}</code></p><MfaForm /></>)}</>)}</div></main></>);
}
