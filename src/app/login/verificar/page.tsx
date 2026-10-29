import { redirect } from 'next/navigation';
import { lerMfaPendente } from '@/lib/session';
import { verificarMfaAcao } from '../../actions';
import { Avisos } from '../../components';

export default async function Verificar({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  if (!(await lerMfaPendente())) redirect('/login');
  const { erro } = await searchParams;
  return (<div className="login card"><div className="marca"><img src="/logo-contvoo.png" alt="Contvoo Contabilidade" height={64} /></div>
    <h1>Verificação em duas etapas</h1><p className="soon">Digite o código de 6 dígitos do seu aplicativo autenticador. Perdeu o celular? Use um dos códigos de recuperação (formato xxxxx-xxxxx).</p><Avisos erro={erro} />
    <form action={verificarMfaAcao}><label htmlFor="codigo">Código</label><input id="codigo" name="codigo" required autoComplete="one-time-code" inputMode="text" autoFocus /><p><button>Confirmar</button></p></form>
    <p><a href="/login">Voltar</a></p></div>);
}
