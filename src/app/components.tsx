import Link from 'next/link';
import { sair } from './actions';
import type { UsuarioSessao } from '@/lib/services/usuarios';
import { mfaDisponivel } from '@/lib/session';

export function Topo({ u }: { u: UsuarioSessao }) {
  return (
    <header className="top">
      <img src="/logo-contvoo.png" alt="Contvoo Contabilidade" height={34} style={{ display: 'block' }} />
      <strong>Painel do Cliente</strong>
      <nav>
        {u.papel === 'admin' ? (<><Link href="/admin">Início</Link><Link href="/admin/empresas">Empresas</Link><Link href="/admin/conciliacoes">Conciliações</Link><Link href="/admin/pendencias">Pendências</Link><Link href="/admin/relatorios">Relatórios</Link><Link href="/admin/usuarios">Usuários</Link><Link href="/admin/lgpd">LGPD</Link></>) : (<Link href="/cliente">Minhas empresas</Link>)}
      </nav>
      {mfaDisponivel(u) ? <a href="/conta/seguranca" title="Segurança da conta">{u.nome}</a> : <span>{u.nome}</span>}
      <form action={sair}><button className="sec">Sair</button></form>
    </header>
  );
}
export function Avisos({ erro, ok }: { erro?: string; ok?: string }) {
  return <>{erro && <div className="msg-err">{erro}</div>}{ok && <div className="msg-ok">{ok}</div>}</>;
}

export const ROTULO: Record<string, string> = { pendente: 'Pendente', enviado: 'Enviado', em_conferencia: 'Em conferência', aprovado: 'Aprovado', rejeitado: 'Rejeitado', substituido: 'Substituído' };
export function CompetenciaSeletor({ atual, extra }: { atual: string; extra?: Record<string, string> }) {
  const agora = new Date();
  const meses = Array.from({ length: 12 }, (_, i) => { const d = new Date(agora.getFullYear(), agora.getMonth() - i, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; });
  if (!meses.includes(atual)) meses.push(atual);
  return (
    <form method="get" className="card row">
      {Object.entries(extra ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <div><label htmlFor="competencia">Competência</label>
        <select id="competencia" name="competencia" defaultValue={atual}>{meses.map((m) => <option key={m} value={m}>{m.split('-')[1]}/{m.split('-')[0]}</option>)}</select></div>
      <button>Ver</button>
    </form>
  );
}
export function competenciaDe(c?: string) {
  if (c && /^\d{4}-(0[1-9]|1[0-2])$/.test(c)) return c;
  const a = new Date(); return `${a.getFullYear()}-${String(a.getMonth() + 1).padStart(2, '0')}`;
}
