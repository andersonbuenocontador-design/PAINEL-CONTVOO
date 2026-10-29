import { entrar } from '../actions';
import { Avisos } from '../components';
export default async function Login({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;
  return (
    <div className="login card">
      <div className="marca"><img src="/logo-contvoo.png" alt="Contvoo Contabilidade" height={64} /></div>
      <h1>Entrar</h1>
      <Avisos erro={erro} />
      <form action={entrar}>
        <label htmlFor="email">E-mail</label><input id="email" name="email" type="email" required autoComplete="username" />
        <label htmlFor="senha">Senha</label><input id="senha" name="senha" type="password" required autoComplete="current-password" />
        <p><button>Entrar</button></p>
      </form>
    </div>
  );
}
