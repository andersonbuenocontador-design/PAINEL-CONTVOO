import Link from 'next/link';
import { AlarmClock, Bell, CheckCircle2, CircleSlash, Clock, Download, MessageSquareText, Plus, SlidersHorizontal } from 'lucide-react';
import { exigirUsuario } from '@/lib/session';
import { CATEGORIAS, contarPendenciasEscritorio, listarPendenciasEscritorio, type FiltroPend } from '@/lib/services/pendencias';
import { listarEmpresas } from '@/lib/services/empresas';
import { Topo } from '../../components';

type SP = { situacao?: string; categoria?: string; vencidas?: string; busca?: string; competencia?: string };
const ha = (d: string | Date) => {
  const dias = Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);
  return dias <= 0 ? 'hoje' : dias === 1 ? 'ontem' : dias < 30 ? `há ${dias} dias` : new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
};
const dataBR = (d: string) => d.split('-').reverse().join('/');

/** Mural de pendências do escritório: avisos em cartões, o que o cliente respondeu primeiro. */
export default async function Pendencias({ searchParams }: { searchParams: Promise<SP> }) {
  const u = await exigirUsuario('admin'); const sp = await searchParams;
  const f: FiltroPend = { situacao: (sp.situacao ?? 'em_andamento') as FiltroPend['situacao'], categoria: (sp.categoria || undefined) as FiltroPend['categoria'], vencidas: sp.vencidas === '1', busca: sp.busca, competencia: sp.competencia || undefined };
  if (sp.situacao === 'todas') f.situacao = undefined;
  const [lista, empresas, n] = await Promise.all([listarPendenciasEscritorio(u, f), listarEmpresas(u), contarPendenciasEscritorio(u)]);
  const peso = (p: (typeof lista)[number]) => (p.situacao === 'respondida' ? 0 : p.vencida ? 1 : p.situacao === 'aberta' ? 2 : 3);
  const itens = [...lista].sort((a, b) => peso(a) - peso(b));
  const qs = new URLSearchParams(Object.entries({ situacao: sp.situacao === 'todas' ? '' : (sp.situacao ?? 'em_andamento'), categoria: sp.categoria ?? '', vencidas: sp.vencidas ?? '', busca: sp.busca ?? '', competencia: sp.competencia ?? '' }).filter(([, v]) => v)).toString();
  const aba = sp.vencidas === '1' ? 'vencidas' : (sp.situacao ?? 'em_andamento');
  const abas = [
    { k: 'em_andamento', href: '/admin/pendencias', txt: 'Em andamento', n: n.respondidas + n.aguardando, icone: <MessageSquareText size={15} /> },
    { k: 'respondida', href: '/admin/pendencias?situacao=respondida', txt: 'Clientes responderam', n: n.respondidas, icone: <Bell size={15} />, tom: 'azul' },
    { k: 'aberta', href: '/admin/pendencias?situacao=aberta', txt: 'Aguardando clientes', n: n.aguardando, icone: <Clock size={15} />, tom: 'laranja' },
    { k: 'vencidas', href: '/admin/pendencias?vencidas=1', txt: 'Vencidas', n: n.vencidas, icone: <AlarmClock size={15} />, tom: 'vermelho' },
    { k: 'resolvida', href: '/admin/pendencias?situacao=resolvida', txt: 'Resolvidas', n: n.resolvidas30, icone: <CheckCircle2 size={15} />, tom: 'verde' },
  ];
  return (<><Topo u={u} /><main className="inicio mural">
    <section className="inicio-ola">
      <div><h1>Mural de pendências</h1><p className="inicio-sub">Pedidos aos clientes e as respostas deles, os mais importantes primeiro.</p></div>
      <details className="mural-nova"><summary className="doc2-btn primario"><Plus size={16} /> Nova solicitação</summary>
        <form method="get" action="/admin/pendencias/nova" className="mural-nova-corpo"><label htmlFor="empresaId">Para qual empresa?</label>
          <select id="empresaId" name="empresaId" required defaultValue=""><option value="" disabled>Escolha a empresa…</option>{empresas.filter((e) => e.situacao === 'ativa').map((e) => <option key={e.id} value={e.id}>{e.razao_social}</option>)}</select>
          <button className="doc2-btn primario">Continuar</button></form></details>
    </section>

    <nav className="mural-abas" aria-label="Filtrar pendências">{abas.map((a) => (
      <Link key={a.k} href={a.href} className={`mural-aba ${a.tom ?? ''}${aba === a.k ? ' ativa' : ''}`} aria-current={aba === a.k ? 'page' : undefined}>{a.icone} {a.txt} <strong>{a.n}</strong></Link>))}
      <Link href="/admin/pendencias?situacao=todas" className={`mural-aba${aba === 'todas' ? ' ativa' : ''}`}>Todas</Link>
    </nav>

    <details className="mural-filtros"><summary><SlidersHorizontal size={15} /> Mais filtros e exportar</summary>
      <form method="get" className="mural-filtros-corpo"><input type="hidden" name="situacao" value={sp.situacao ?? 'em_andamento'} />
        <div><label>Empresa</label><input name="busca" defaultValue={sp.busca ?? ''} placeholder="Nome da empresa" /></div>
        <div><label>Assunto</label><select name="categoria" defaultValue={sp.categoria ?? ''}><option value="">Todos</option>{Object.entries(CATEGORIAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div><label>Competência</label><input type="month" name="competencia" defaultValue={sp.competencia ?? ''} /></div>
        <div className="mural-filtros-botoes"><button className="doc2-btn primario">Filtrar</button><a className="doc2-btn leve" href={`/api/pendencias/exportar?${qs}`}><Download size={15} /> Excel</a></div>
      </form></details>

    <section className="mural-lista" aria-label="Pendências">
      {itens.map((p) => {
        const tom = p.situacao === 'respondida' ? 'azul' : p.vencida ? 'vermelho' : p.situacao === 'aberta' ? 'laranja' : p.situacao === 'resolvida' ? 'verde' : 'cinza';
        const rotulo = p.situacao === 'respondida' ? 'Cliente respondeu' : p.vencida ? 'Prazo vencido' : p.situacao === 'aberta' ? 'Aguardando o cliente' : p.situacao === 'resolvida' ? 'Resolvida' : 'Cancelada';
        const icone = p.situacao === 'respondida' ? <Bell size={18} /> : p.vencida ? <AlarmClock size={18} /> : p.situacao === 'aberta' ? <Clock size={18} /> : p.situacao === 'resolvida' ? <CheckCircle2 size={18} /> : <CircleSlash size={18} />;
        const [titulo, ...resto] = p.descricao.split('\n'); const corpo = resto.join(' ').replace(/\s+/g, ' ').trim();
        return (<Link key={p.id} href={`/admin/empresas/${p.empresa_id}/pendencias`} className={`mural-card ${tom}`}>
          <span className={`mural-icone ${tom}`}>{icone}</span>
          <div className="mural-corpo">
            <div className="mural-topo"><strong className="mural-empresa">{p.razao_social}</strong><span className={`mural-status ${tom}`}>{rotulo}</span></div>
            <div className="mural-titulo">{titulo.length > 140 ? `${titulo.slice(0, 140)}…` : titulo}</div>
            {corpo && <div className="mural-texto">{corpo}</div>}
            {p.ultima_texto && <div className={`mural-ultima ${p.ultima_papel === 'cliente' ? 'cliente' : ''}`}><b>{p.ultima_papel === 'cliente' ? `${p.ultima_autor ?? 'Cliente'} respondeu:` : 'Escritório:'}</b> {p.ultima_texto.length > 160 ? `${p.ultima_texto.slice(0, 160)}…` : p.ultima_texto}</div>}
            <div className="mural-meta">
              <span className="mural-tag">{CATEGORIAS[p.categoria]}{p.competencia ? ` · ${p.competencia.slice(5)}/${p.competencia.slice(0, 4)}` : ''}</span>
              <span>aberta {ha(p.criado_em)}</span>
              {p.prazo && <span className={p.vencida ? 'vencida' : ''}>prazo {dataBR(p.prazo)}</span>}
              {p.mensagens > 0 && <span><MessageSquareText size={13} /> {p.mensagens}</span>}
              {p.responsavel && <span>resp. {p.responsavel}</span>}
            </div>
          </div>
          <span className="mural-abrir">Abrir →</span>
        </Link>); })}
      {!itens.length && <div className="mural-vazio"><CheckCircle2 size={28} /><p>Nada por aqui com esses filtros.</p></div>}
      {lista.length === 1000 && <p className="soon">Mostrando as 1000 primeiras. Use os filtros para refinar.</p>}
    </section>
  </main></>);
}
