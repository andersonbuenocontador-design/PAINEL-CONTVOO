'use client';
// Botão "Excluir" do extrato no cartão do banco: pede confirmação antes de tirar os lançamentos da conciliação.
import { acaoExcluirImportacao } from './extratos-actions';

export function ExcluirExtrato({ id, empresaId, competencia, arquivo }: { id: string; empresaId: string; competencia: string; arquivo: string }) {
  return (<form action={acaoExcluirImportacao} className="excluir-extrato"
    onSubmit={(e) => { if (!window.confirm(`Excluir o extrato "${arquivo}" da conciliação?\n\nOs lançamentos dele (e o que já foi classificado neles) serão apagados. O arquivo continua nos documentos.`)) e.preventDefault(); }}>
    <input type="hidden" name="id" value={id} /><input type="hidden" name="empresaId" value={empresaId} /><input type="hidden" name="competencia" value={competencia} />
    <button className="btn link perigo-txt" title={`Retirar da conciliação os lançamentos de ${arquivo}`} aria-label={`Excluir o extrato ${arquivo} da conciliação`}>Excluir</button>
  </form>);
}
