'use client';
// Comprovantes de um lançamento (nota, boleto ou recibo em PDF ou foto): lista, anexar e retirar, sem recarregar a página.
import { useRef, useState } from 'react';
import { acaoAnexarComprovante, acaoRemoverComprovante } from './conciliacao-actions';

export type Comprovante = { id: string; nome: string };
export function Comprovantes({ movimentacaoId, inicial, editavel }: { movimentacaoId: number; inicial: Comprovante[]; editavel: boolean }) {
  const [lista, setLista] = useState(inicial); const [enviando, setEnviando] = useState(false); const [erro, setErro] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const enviar = async (f: File) => {
    setEnviando(true); setErro(null);
    const fd = new FormData(); fd.set('movimentacaoId', String(movimentacaoId)); fd.set('arquivo', f);
    const r = await acaoAnexarComprovante(fd); setEnviando(false);
    if (r.ok) setLista((l) => [...l, { id: r.id, nome: r.nome }]); else setErro(r.erro);
    if (input.current) input.current.value = '';
  };
  const remover = async (id: string) => { const r = await acaoRemoverComprovante(id); if (r.ok) setLista((l) => l.filter((c) => c.id !== id)); else setErro(r.erro); };
  return (<div className="comprovantes">
    {lista.map((c) => <span key={c.id} className="comprovante"><a href={`/api/conciliacao/comprovante/${c.id}`} title="Baixar comprovante">{c.nome}</a>
      {editavel && <button type="button" className="btn link" onClick={() => void remover(c.id)} aria-label={`Retirar ${c.nome}`}>retirar</button>}</span>)}
    {editavel && <label className="btn anexar">{enviando ? 'Enviando…' : lista.length ? 'Anexar outro' : 'Anexar comprovante'}
      <input ref={input} type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" hidden disabled={enviando} onChange={(e) => { const f = e.target.files?.[0]; if (f) void enviar(f); }} /></label>}
    {editavel && !lista.length && <span className="muted dica-comp">Opcional: PDF ou foto da nota, boleto ou recibo (até 10 MB).</span>}
    {erro && <span className="falta-nota" role="alert">{erro}</span>}
  </div>);
}
