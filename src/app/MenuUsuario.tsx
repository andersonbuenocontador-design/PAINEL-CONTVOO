'use client';
// Menu do usuário no topo (estilo Contvoo Gestão): iniciais, nome e papel; abre com Segurança da conta e Sair.
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, LogOut, ShieldCheck } from 'lucide-react';

export function MenuUsuario({ nome, papel, email, seguranca, sair }: { nome: string; papel: string; email: string; seguranca: boolean; sair: () => Promise<void> }) {
  const [aberto, setAberto] = useState(false); const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false); }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, []);
  const ini = nome.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  return (<div className="menu-usuario" ref={ref}>
    <button type="button" className="menu-usuario-botao" aria-expanded={aberto} onClick={() => setAberto(!aberto)}>
      <span className="avatar">{ini}</span>
      <span className="menu-usuario-nome"><strong>{nome}</strong><small>{papel}</small></span>
      <ChevronDown size={16} className="menu-usuario-seta" />
    </button>
    {aberto && <div className="menu-usuario-lista">
      <div className="menu-usuario-email">{email}</div>
      {seguranca && <a href="/conta/seguranca"><ShieldCheck size={15} /> Segurança da conta</a>}
      <form action={sair}><button className="sair"><LogOut size={15} /> Sair</button></form>
    </div>}
  </div>);
}
