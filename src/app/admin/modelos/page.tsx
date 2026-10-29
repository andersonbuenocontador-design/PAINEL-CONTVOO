import { exigirUsuario } from '@/lib/session';
import { listarModelos } from '@/lib/services/documentos';
import { listarEmpresas } from '@/lib/services/empresas';
import { Avisos, Topo } from '../../components';
import { acaoAplicarModelo } from '../docs-actions';

export default async function Modelos({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string }> }) {
  const u = await exigirUsuario('admin'); const sp = await searchParams;
  const [modelos, empresas] = await Promise.all([listarModelos(u), listarEmpresas(u)]);
  return (<><Topo u={u} /><main><h1>Modelos de documentos</h1><Avisos erro={sp.erro} ok={sp.ok} />
    <p className="soon">Para criar um modelo, configure os documentos de uma empresa e use "Salvar como modelo" na tela de documentos dela.</p>
    {modelos.map((m) => (<div className="card" key={m.id}><h2>{m.nome}</h2>
      <ul>{(m.itens as { nome: string; instituicao: string | null; frequencia: string }[]).map((i, k) => <li key={k}>{i.nome}{i.instituicao && ` — ${i.instituicao}`} ({i.frequencia})</li>)}</ul>
      <form action={acaoAplicarModelo}><input type="hidden" name="modeloId" value={m.id} /><input type="hidden" name="voltar" value="/admin/modelos" />
        <label>Aplicar às empresas (segure Ctrl para várias)</label><select name="empresaIds" multiple size={6} required>{empresas.map((e) => <option key={e.id} value={e.id}>{e.razao_social}</option>)}</select>
        <p><button>Aplicar modelo</button> <span className="soon">Documentos que a empresa já tem são mantidos.</span></p></form></div>))}
    {!modelos.length && <div className="card soon">Nenhum modelo criado ainda.</div>}</main></>);
}
