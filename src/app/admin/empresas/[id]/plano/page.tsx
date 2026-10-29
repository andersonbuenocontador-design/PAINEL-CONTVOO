import { notFound } from 'next/navigation';
import { exigirUsuario } from '@/lib/session';
import { obterEmpresa } from '@/lib/services/empresas';
import { listarPlano } from '@/lib/services/conciliacao';
import { AppError } from '@/lib/errors';
import { Avisos, Topo } from '../../../../components';
import { acaoAtivarContaPlano, acaoImportarPlano, acaoReclassificar, acaoSalvarContaPlano } from '../../../../conciliacao-actions';

export default async function PlanoDeContas({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ erro?: string; ok?: string }> }) {
  const u = await exigirUsuario('admin'); const { id } = await params; const sp = await searchParams;
  let e; try { e = await obterEmpresa(u, id); } catch (x) { if (x instanceof AppError) notFound(); throw x; }
  const plano = await listarPlano(u, id, true);
  return (<><Topo u={u} /><main>
    <p><a href={`/admin/empresas/${id}/extratos`}>← Extratos</a> · <a href={`/admin/empresas/${id}`}>Empresa</a></p>
    <h1>Plano de contas — {e.razao_social}</h1><Avisos erro={sp.erro} ok={sp.ok} />
    <p className="soon">Este plano é só desta empresa. O cliente escolhe as contas daqui e o sistema usa as regras do Conciliador para sugerir a conta de cada lançamento.</p>
    <div className="card"><h2>Contas ({plano.filter((c) => c.ativo).length} ativas)</h2>
      <table><thead><tr><th>Código</th><th>Classificação</th><th>Nome</th><th></th></tr></thead><tbody>
        {plano.map((c) => (<tr key={c.id}><td>{c.codigo}</td><td>{c.classificacao}</td><td>{c.nome} {!c.ativo && <span className="tag off">inativa</span>}</td>
          <td><form action={acaoAtivarContaPlano}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="empresaId" value={id} /><input type="hidden" name="ativo" value={String(!c.ativo)} /><button className="sec">{c.ativo ? 'Desativar' : 'Reativar'}</button></form></td></tr>))}
        {!plano.length && <tr><td colSpan={4} className="soon">Nenhuma conta cadastrada. Importe o relatório do Domínio abaixo ou cadastre manualmente.</td></tr>}</tbody></table></div>
    <div className="card"><h2>Adicionar ou editar conta</h2><p className="soon">Se o código já existir, a conta é atualizada.</p>
      <form action={acaoSalvarContaPlano}><input type="hidden" name="empresaId" value={id} /><div className="grid">
        <div><label>Código *</label><input name="codigo" type="number" min={1} required /></div><div><label>Classificação * (ex.: 3.2.1.01.0004)</label><input name="classificacao" required /></div><div><label>Nome *</label><input name="nome" required /></div></div><p><button>Salvar conta</button></p></form></div>
    <div className="card"><h2>Importar do Domínio</h2><p className="soon">Cole o texto do relatório "Relacionamento de contas com o plano referencial" (código, classificação e nome). Contas com o mesmo código são atualizadas.</p>
      <form action={acaoImportarPlano}><input type="hidden" name="empresaId" value={id} /><textarea name="texto" rows={8} required style={{ width: '100%', fontFamily: 'monospace' }} /><p><button>Importar plano</button></p></form></div>
    <div className="card"><h2>Reclassificar</h2><p className="soon">Reaplica as regras aos lançamentos ainda não revisados desta empresa (útil depois de mudar o plano). Lançamentos já confirmados não mudam.</p>
      <form action={acaoReclassificar}><input type="hidden" name="empresaId" value={id} /><button className="sec">Reclassificar não revisados</button></form></div>
  </main></>);
}
