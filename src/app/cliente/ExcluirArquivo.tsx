'use client';
// Botão "Excluir" do documento enviado (cliente): pede confirmação antes.
import { acaoExcluirArquivo } from './actions';

export function ExcluirArquivo({ id, empresaId, competencia, nome }: { id: string; empresaId: string; competencia: string; nome: string }) {
  return (<form action={acaoExcluirArquivo} className="excluir-arquivo"
    onSubmit={(e) => { if (!window.confirm(`Excluir "${nome}"?\n\nSe for extrato, os lançamentos dele também saem da conciliação.`)) e.preventDefault(); }}>
    <input type="hidden" name="id" value={id} /><input type="hidden" name="empresaId" value={empresaId} /><input type="hidden" name="competencia" value={competencia} />
    <button className="link-perigo" aria-label={`Excluir ${nome}`}>Excluir</button>
  </form>);
}
