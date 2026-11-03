'use client';
// Botão sol/lua do topo: alterna modo dia e modo noite; a escolha fica guardada neste navegador.
import { useEffect, useState } from 'react';

export function TemaBotao() {
  const [escuro, setEscuro] = useState(false);
  useEffect(() => { setEscuro(document.documentElement.dataset.theme === 'dark'); }, []);
  const trocar = () => {
    const novo = !escuro; setEscuro(novo);
    if (novo) document.documentElement.dataset.theme = 'dark'; else delete document.documentElement.dataset.theme;
    try { localStorage.setItem('tema', novo ? 'escuro' : 'claro'); } catch { /* navegador sem armazenamento: vale só nesta página */ }
  };
  const rotulo = escuro ? 'Mudar para o modo dia' : 'Mudar para o modo noite';
  return (<button type="button" className="tema-botao" onClick={trocar} aria-label={rotulo} title={rotulo}>
    {escuro
      ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.5" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
      : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></svg>}
  </button>);
}
