'use client';
// Botão "Apagar extratos do mês" (cliente): apaga todos os extratos enviados no mês, mesmo aprovados, e a conciliação do mês.
import { acaoApagarExtratosMes } from './actions';

export function ApagarExtratosMes({ empresaId, competencia, extratos, lancamentos }: { empresaId: string; competencia: string; extratos: number; lancamentos: number }) {
  const mes = `${competencia.slice(5, 7)}/${competencia.slice(0, 4)}`;
  return (<form action={acaoApagarExtratosMes} className="apagar-extratos-mes"
    onSubmit={(e) => {
      const msg = `Apagar TODOS os extratos de ${mes}?\n\n• ${extratos} extrato(s) enviado(s), inclusive os já aprovados pelo escritório\n• a conciliação de ${mes} inteira (${lancamentos} lançamento(s) e as classificações feitas)\n\nIsso não pode ser desfeito. Depois você pode enviar os extratos de novo.`;
      if (!window.confirm(msg)) { e.preventDefault(); return; }
      const t = window.prompt(`Para confirmar, digite APAGAR`);
      if ((t ?? '').trim().toUpperCase() !== 'APAGAR') e.preventDefault();
    }}>
    <input type="hidden" name="empresaId" value={empresaId} /><input type="hidden" name="competencia" value={competencia} />
    <button className="danger">Apagar extratos e conciliação de {mes}</button>
  </form>);
}
