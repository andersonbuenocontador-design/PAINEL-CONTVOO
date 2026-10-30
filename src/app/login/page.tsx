import { entrar } from '../actions';
import { Avisos } from '../components';

export default async function Login({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;
  return (
    <div className="login-fundo">
      <div className="login card">
        <div className="login-logo"><img src="/logo-contvoo-completo.webp" alt="Contvoo Contabilidade" width={240} height={50} /></div>
        <h1>Bem-vindo ao Painel do Cliente</h1>
        <p className="soon login-sub">Entre com o e-mail e a senha que o escritório enviou para você.</p>
        <Avisos erro={erro} />
        <form action={entrar}>
          <label htmlFor="email">E-mail</label><input id="email" name="email" type="email" required autoComplete="username" placeholder="seu@email.com.br" />
          <label htmlFor="senha">Senha</label><input id="senha" name="senha" type="password" required autoComplete="current-password" />
          <p><button className="login-botao">Entrar</button></p>
        </form>
        <p className="soon login-ajuda">Esqueceu a senha? Fale com a Contvoo que enviamos uma nova.</p>
      </div>
    </div>
  );
}
