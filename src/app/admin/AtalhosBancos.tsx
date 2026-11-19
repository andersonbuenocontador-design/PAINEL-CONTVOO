'use client';
// Botões rápidos para pedir o extrato de um banco: preenchem nome, banco, categoria e formatos do formulário.
import { BANCOS } from '@/lib/bancos';

const POPULARES = ['nubank', 'itau', 'bradesco', 'santander', 'bb', 'caixa', 'sicredi', 'sicoob', 'inter', 'c6', 'banrisul', 'mercadopago', 'pagbank', 'stone', 'cora', 'btg', 'cresol', 'unicred', 'safra', 'asaas', 'picpay', 'infinitepay', 'getnet', 'cielo', 'semparar'];
export function AtalhosBancos() {
  const preencher = (el: HTMLElement, nome: string) => {
    const f = el.closest('form'); if (!f) return;
    const set = (n: string, v: string) => { const i = f.elements.namedItem(n) as HTMLInputElement | null; if (i) i.value = v; };
    set('nome', nome === 'Sem Parar' ? 'Fatura Sem Parar' : `Extrato ${nome}`); set('instituicao', nome); set('categoria', nome === 'Sem Parar' ? 'Faturas' : 'Extratos');
    f.querySelectorAll<HTMLInputElement>('input[name=formatos]').forEach((c) => { c.checked = c.value === 'pdf' || c.value === 'ofx'; });
    (f.elements.namedItem('nome') as HTMLInputElement | null)?.focus();
  };
  return (<div className="doc2-atalhos"><span className="soon">Pedir rápido:</span>
    {POPULARES.map((k) => { const b = BANCOS.find((x) => x.chave === k)!; return (
      <button key={k} type="button" className="doc2-banco" onClick={(e) => preencher(e.currentTarget, b.nome)}>
        {b.logo ? <span className="marca-doc com-logo" style={{ width: 24, height: 24 }}><img src={b.logo} alt="" width={19} height={19} /></span> : <span className="marca-doc" style={{ width: 22, height: 22, background: b.fundo, color: b.texto, fontSize: b.sigla.length > 2 ? 7 : 9 }}>{b.sigla}</span>}{b.nome}</button>); })}
  </div>);
}
