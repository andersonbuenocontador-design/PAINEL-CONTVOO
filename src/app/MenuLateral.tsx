'use client';
// Menu no estilo do Contvoo Gestão: abre pelo botão ☰ do topo como um painel azul à esquerda.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  BarChart3, Banknote, Bell, Building2, CalendarCheck, ChevronDown, CircleHelp, ClipboardList, FileBarChart, FileText, Home, KeyRound,
  Landmark, LayoutDashboard, Layers, MessageCircle, MessagesSquare, Settings, ShieldCheck, ScrollText, Wallet,
} from 'lucide-react';

type Item = { rotulo: string; para: string; icone: React.ReactNode; exato?: boolean };
type Grupo = { titulo: string; icone: React.ReactNode; itens: Item[] };
const I = 16;

function menuEscritorio(): Grupo[] {
  return [
    { titulo: 'Visão geral', icone: <LayoutDashboard size={18} />, itens: [
      { rotulo: 'Início', para: '/admin', icone: <Home size={I} />, exato: true },
      { rotulo: 'Entregas do mês', para: '/admin/entregas', icone: <ClipboardList size={I} /> },
      { rotulo: 'Empresas', para: '/admin/empresas', icone: <Building2 size={I} /> },
    ] },
    { titulo: 'Dia a dia', icone: <CalendarCheck size={18} />, itens: [
      { rotulo: 'Conciliações', para: '/admin/conciliacoes', icone: <Landmark size={I} /> },
      { rotulo: 'Lucros dos sócios', para: '/admin/lucros', icone: <Banknote size={I} /> },
      { rotulo: 'Pendências', para: '/admin/pendencias', icone: <MessagesSquare size={I} /> },
    ] },
    { titulo: 'Análises', icone: <BarChart3 size={18} />, itens: [
      { rotulo: 'Relatórios', para: '/admin/relatorios', icone: <FileBarChart size={I} /> },
    ] },
    { titulo: 'Ajustes', icone: <Settings size={18} />, itens: [
      { rotulo: 'Usuários', para: '/admin/usuarios', icone: <KeyRound size={I} /> },
      { rotulo: 'WhatsApp (Digisac)', para: '/admin/whatsapp', icone: <MessageCircle size={I} /> },
      { rotulo: 'Modelos de documentos', para: '/admin/modelos', icone: <Layers size={I} /> },
      { rotulo: 'Notificações', para: '/admin/notificacoes', icone: <Bell size={I} /> },
      { rotulo: 'Auditoria', para: '/admin/auditoria', icone: <ScrollText size={I} /> },
      { rotulo: 'LGPD', para: '/admin/lgpd', icone: <ShieldCheck size={I} /> },
      { rotulo: 'Ajuda', para: '/ajuda', icone: <CircleHelp size={I} /> },
    ] },
  ];
}
function menuCliente(empresaId: string | null): Grupo[] {
  const b = empresaId ? `/cliente/${empresaId}` : null;
  return [
    { titulo: 'Minha empresa', icone: <LayoutDashboard size={18} />, itens: [
      { rotulo: 'Início', para: b ?? '/cliente', icone: <Home size={I} />, exato: true },
      ...(b ? [
        { rotulo: 'Documentos do mês', para: `${b}/documentos`, icone: <FileText size={I} /> },
        { rotulo: 'Extratos e conciliação', para: `${b}/extratos`, icone: <Landmark size={I} /> },
        { rotulo: 'Retiradas dos sócios', para: `${b}/informes`, icone: <Wallet size={I} /> },
        { rotulo: 'Pendências', para: `${b}/pendencias`, icone: <MessagesSquare size={I} /> },
      ] : []),
    ] },
    { titulo: 'Ajuda', icone: <CircleHelp size={18} />, itens: [{ rotulo: 'Vídeos e passo a passo', para: '/ajuda', icone: <CircleHelp size={I} /> }] },
  ];
}

function Lista({ grupos, compacta, onNavegar }: { grupos: Grupo[]; compacta: boolean; onNavegar?: () => void }) {
  const pathname = usePathname() ?? '';
  const ativoItem = (i: Item) => (i.exato ? pathname === i.para : pathname === i.para || pathname.startsWith(`${i.para}/`));
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});
  return (
    <nav className={`lateral-nav${compacta ? ' compacta' : ''}`} aria-label="Menu principal">
      <div className="lateral-grupos">
        {grupos.map((g, idx) => {
          const temAtivo = g.itens.some(ativoItem);
          if (compacta) return <div key={g.titulo} className={`lateral-icone${temAtivo ? ' ativo' : ''}`} title={g.titulo} aria-label={g.titulo}>{g.icone}</div>;
          const aberto = abertos[g.titulo] ?? (idx === 0 || temAtivo);
          return (<div key={g.titulo} className={`lateral-grupo${aberto ? ' aberto' : ''}`}>
            <button type="button" className="lateral-titulo" aria-expanded={aberto} onClick={() => setAbertos((o) => ({ ...o, [g.titulo]: !aberto }))}>
              <span className={`lateral-titulo-icone${temAtivo ? ' ativo' : ''}`}>{g.icone}</span><span className="lateral-titulo-txt">{g.titulo}</span>
              <ChevronDown size={14} className={`lateral-seta${aberto ? '' : ' fechada'}`} />
            </button>
            {aberto && <ul>{g.itens.map((i) => <li key={i.para}><Link href={i.para} onClick={onNavegar} className={ativoItem(i) ? 'ativo' : undefined} aria-current={ativoItem(i) ? 'page' : undefined}>{i.icone}<span>{i.rotulo}</span></Link></li>)}</ul>}
          </div>);
        })}
      </div>
    </nav>
  );
}

export function MenuLateral({ papel }: { papel: 'admin' | 'cliente' }) {
  const pathname = usePathname() ?? '';
  const empresaId = papel === 'cliente' ? (pathname.match(/^\/cliente\/([0-9a-f-]{36})/)?.[1] ?? null) : null;
  const grupos = papel === 'admin' ? menuEscritorio() : menuCliente(empresaId);
  const [movel, setMovel] = useState(false);
  useEffect(() => { const h = () => setMovel((m) => !m); window.addEventListener('menu-lateral', h); return () => window.removeEventListener('menu-lateral', h); }, []);
  useEffect(() => { setMovel(false); }, [pathname]);
  // sem barra fixa na lateral: o menu abre pelo botão ☰ do topo (computador e celular)
  return (<>
    {movel && <div className="lateral-movel" role="dialog" aria-label="Menu">
      <div className="lateral-movel-fundo" onClick={() => setMovel(false)} />
      <div className="lateral-movel-painel"><Lista grupos={grupos} compacta={false} onNavegar={() => setMovel(false)} /></div>
    </div>}
  </>);
}

/** Botão ☰ do topo (celular): abre o menu lateral. */
export function BotaoMenu() {
  return <button type="button" className="botao-menu" aria-label="Abrir menu" onClick={() => window.dispatchEvent(new Event('menu-lateral'))}>
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg></button>;
}
