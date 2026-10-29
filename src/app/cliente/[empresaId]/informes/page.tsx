import { notFound } from 'next/navigation';
import { exigirUsuario } from '@/lib/session';
import { obterEmpresa } from '@/lib/services/empresas';
import { listarInformesCliente } from '@/lib/services/informes';
import { AppError } from '@/lib/errors';
import { Topo } from '../../../components';

export default async function Informes({ params, searchParams }: { params: Promise<{ empresaId: string }>; searchParams: Promise<{ ano?: string }> }) {
  const u = await exigirUsuario('cliente'); const { empresaId } = await params; const sp = await searchParams;
  let e, todos; try { e = await obterEmpresa(u, empresaId); todos = await listarInformesCliente(u, empresaId); } catch (x) { if (x instanceof AppError) notFound(); throw x; }
  const anos = [...new Set(todos.map((i) => i.ano_calendario))]; const ano = Number(sp.ano) || undefined;
  const lista = ano ? todos.filter((i) => i.ano_calendario === ano) : todos;
  return (<><Topo u={u} /><main><p><a href={`/cliente/${empresaId}`}>← {e.razao_social}</a></p><h1>Informes de lucros e retiradas</h1>
    {anos.length > 1 && <form method="get" className="card row"><div><label htmlFor="ano">Ano-calendário</label><select id="ano" name="ano" defaultValue={ano ?? ''}><option value="">Todos</option>{anos.map((a) => <option key={a} value={a}>{a}</option>)}</select></div><button>Filtrar</button></form>}
    <div className="card"><table><thead><tr><th>Ano</th><th>Sócio</th><th>Documento</th><th>Situação</th><th>Disponibilizado em</th><th></th></tr></thead><tbody>
      {lista.map((i) => (<tr key={i.id}><td>{i.ano_calendario}{i.periodo && <div className="soon">{i.periodo}</div>}</td><td>{i.socio}<div className="soon">CPF {i.cpf_mascarado}</div></td><td>{i.tipo}{i.descricao && <div className="soon">{i.descricao}</div>}</td><td><span className="tag">Disponível</span></td>
        <td>{i.disponibilizado_em ? new Date(i.disponibilizado_em).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—'}</td><td><a className="btn" href={`/api/informes/${i.id}`}>Baixar</a></td></tr>))}
      {!lista.length && <tr><td colSpan={6} className="soon">Nenhum informe disponível para o seu acesso. Os informes de cada sócio só aparecem para as pessoas autorizadas pelo escritório.</td></tr>}</tbody></table></div></main></>);
}
