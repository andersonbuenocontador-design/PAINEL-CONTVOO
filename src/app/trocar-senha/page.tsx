import { redirect } from 'next/navigation';
import { alterarSenha } from '../actions';
import { Avisos } from '../components';
import { usuarioAtual } from '@/lib/session';
export default async function Trocar({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  if (!(await usuarioAtual())) redirect('/login');
  const { erro } = await searchParams;
  return (
    <div className="login card">
      <div className="marca"><img src="/logo-contvoo.png" alt="Contvoo Contabilidade" height={64} /></div>
      <h1>Defina sua nova senha</h1>
      <p className="soon">Mínimo de 10 caracteres.</p>
      <Avisos erro={erro} />
      <form action={alterarSenha}>
        <label htmlFor="atual">Senha atual</label><input id="atual" name="atual" type="password" required autoComplete="current-password" />
        <label htmlFor="nova">Nova senha</label><input id="nova" name="nova" type="password" required minLength={10} autoComplete="new-password" />
        <label htmlFor="confirma">Confirmar nova senha</label><input id="confirma" name="confirma" type="password" required minLength={10} autoComplete="new-password" />
        <p><button>Salvar senha</button></p>
      </form>
    </div>
  );
}
