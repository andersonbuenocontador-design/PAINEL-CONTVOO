import Link from 'next/link';
import { sair } from './actions';
import type { UsuarioSessao } from '@/lib/services/usuarios';
import { mfaDisponivel } from '@/lib/session';

/** Topo enxuto: marca (leva à tela inicial), nome e Sair. A navegação fica nos cartões da tela inicial. */
export function Topo({ u }: { u: UsuarioSessao }) {
  const inicio = u.papel === 'admin' ? '/admin' : '/cliente';
  const nome = u.papel === 'admin' && u.nome === 'Administrador' ? 'Contvoo Contabilidade' : u.nome;
  return (
    <header className="top">
      <Link href={inicio} className="marca-topo" title="Voltar à tela inicial">
        <img src="/logo-contvoo.png" alt="Contvoo Contabilidade" height={30} style={{ display: 'block' }} />
        <strong>{u.papel === 'admin' ? 'Painel Contvoo' : 'Painel do Cliente'}</strong>
      </Link>
      <span className="espaco" />
      <Link href={inicio} className="inicio-topo">Início</Link>
      {mfaDisponivel(u) ? <a href="/conta/seguranca" title="Segurança da conta" className="nome-topo">{nome}</a> : <span className="nome-topo">{nome}</span>}
      <form action={sair}><button className="sec">Sair</button></form>
    </header>
  );
}

const ICONES: Record<string, string> = {
  docs: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h6',
  predio: 'M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M16 9h2a2 2 0 0 1 2 2v10M3 21h18M8 7h4M8 11h4M8 15h4',
  banco: 'M3 10h18M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 21h18M12 3l9 5H3z',
  conversa: 'M21 12a8 8 0 0 1-11.6 7.1L4 21l1.9-5.4A8 8 0 1 1 21 12z',
  grafico: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  pessoas: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  escudo: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  dinheiro: 'M2 7h20v10H2zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 12h.01M18 12h.01',
  entrega: 'M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
};
/** Cartão grande da tela inicial (hub). `alerta` destaca em laranja o que pede atenção; `ok` mostra em verde o que está em dia. */
export function Atalho({ href, icone, titulo, desc, info, alerta, ok }: { href: string; icone: keyof typeof ICONES | string; titulo: string; desc: string; info?: string; alerta?: boolean; ok?: boolean }) {
  return (
    <Link href={href} className={`atalho${alerta ? ' alerta' : ''}`}>
      <span className="icone" aria-hidden="true"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={ICONES[icone] ?? ICONES.docs} /></svg></span>
      <span className="txt"><strong>{titulo}</strong><span className="soon">{desc}</span>{info && <span className={`info${alerta ? ' alerta' : ok ? ' ok' : ''}`}>{info}</span>}</span>
    </Link>
  );
}
export function Avisos({ erro, ok }: { erro?: string; ok?: string }) {
  return <>{erro && <div className="msg-err">{erro}</div>}{ok && <div className="msg-ok">{ok}</div>}</>;
}

export const ROTULO: Record<string, string> = { pendente: 'Pendente', enviado: 'Enviado', em_conferencia: 'Em conferência', aprovado: 'Aprovado', rejeitado: 'Rejeitado', substituido: 'Substituído' };
export function CompetenciaSeletor({ atual, extra, mini }: { atual: string; extra?: Record<string, string>; mini?: boolean }) {
  const agora = new Date();
  const meses = Array.from({ length: 12 }, (_, i) => { const d = new Date(agora.getFullYear(), agora.getMonth() - i, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; });
  if (!meses.includes(atual)) meses.push(atual);
  return (
    <form method="get" className={mini ? 'comp-mini' : 'card row'}>
      {Object.entries(extra ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <div>{!mini && <label htmlFor="competencia">Competência</label>}
        <select id="competencia" name="competencia" defaultValue={atual} aria-label="Competência">{meses.map((m) => <option key={m} value={m}>{m.split('-')[1]}/{m.split('-')[0]}</option>)}</select></div>
      <button>Ver</button>
    </form>
  );
}
export function competenciaDe(c?: string) {
  if (c && /^\d{4}-(0[1-9]|1[0-2])$/.test(c)) return c;
  const a = new Date(); return `${a.getFullYear()}-${String(a.getMonth() + 1).padStart(2, '0')}`;
}
