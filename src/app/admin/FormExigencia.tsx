import { FORMATOS_PERMITIDOS, FREQUENCIAS } from '@/lib/services/documentos';

type Ex = { nome?: string; instituicao?: string | null; categoria?: string | null; formatos?: string[]; obrigatorio?: boolean; frequencia?: string; instrucoes?: string | null; dia_prazo?: number | null };
export function CamposExigencia({ e = {} }: { e?: Ex }) {
  return (<><div className="grid">
    <div><label>Nome do documento *</label><input name="nome" defaultValue={e.nome} required placeholder="Extrato da conta corrente" /></div>
    <div><label>Banco / instituição</label><input name="instituicao" defaultValue={e.instituicao ?? ''} placeholder="Banrisul" /></div>
    <div><label>Categoria</label><input name="categoria" defaultValue={e.categoria ?? ''} placeholder="Extratos" /></div>
    <div><label>Frequência</label><select name="frequencia" defaultValue={e.frequencia ?? 'mensal'}>{FREQUENCIAS.map((f) => <option key={f}>{f}</option>)}</select></div>
    <div><label>Prazo (dia do mês)</label><input name="diaPrazo" type="number" min={1} max={31} defaultValue={e.dia_prazo ?? ''} /></div>
    <div><label>Instruções para o cliente</label><input name="instrucoes" defaultValue={e.instrucoes ?? ''} /></div>
  </div>
  <label>Formatos aceitos *</label>
  <div className="row">{FORMATOS_PERMITIDOS.map((f) => <label key={f} style={{ margin: 0 }}><input type="checkbox" name="formatos" value={f} defaultChecked={e.formatos ? e.formatos.includes(f) : f === 'pdf'} style={{ width: 'auto' }} /> {f.toUpperCase()}</label>)}</div>
  <label><input type="checkbox" name="obrigatorio" defaultChecked={e.obrigatorio ?? true} style={{ width: 'auto' }} /> Obrigatório</label></>);
}
