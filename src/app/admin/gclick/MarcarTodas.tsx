'use client';
// Caixinha do cabeçalho: marca/desmarca todos os clientes da lista.
export function MarcarTodas() {
  return <input type="checkbox" aria-label="Marcar todas" onChange={(e) => { e.currentTarget.closest('form')?.querySelectorAll<HTMLInputElement>('input[name=gclickId]').forEach((c) => { c.checked = e.currentTarget.checked; }); }} />;
}
