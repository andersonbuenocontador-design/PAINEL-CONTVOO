'use client';
import { useActionState } from 'react';
import { acaoAtivarMfa } from '../../seguranca-actions';

export function MfaForm() {
  const [r, enviar, pend] = useActionState(acaoAtivarMfa, null);
  if (r?.codigos) return (<div className="msg-ok"><strong>Verificação em duas etapas ativada.</strong>
    <p>Guarde estes códigos de recuperação em local seguro (cada um funciona uma única vez e <strong>não serão mostrados de novo</strong>):</p>
    <pre style={{ fontSize: '1.1rem', background: '#fff', padding: 12, borderRadius: 8 }}>{r.codigos.join('\n')}</pre><a className="btn" href="/">Continuar</a></div>);
  return (<form action={enviar}>{r?.erro && <div className="msg-err">{r.erro}</div>}<label htmlFor="codigo">Código do aplicativo (6 dígitos)</label><input id="codigo" name="codigo" required inputMode="numeric" autoComplete="one-time-code" /><p><button disabled={pend}>Ativar</button></p></form>);
}
