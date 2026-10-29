import { exigirUsuario } from '@/lib/session';
import { listarAuditoria } from '@/lib/services/auditoria';
import { Topo } from '../../components';

export default async function Auditoria() {
  const u = await exigirUsuario('admin'); const logs = await listarAuditoria(u);
  return (<><Topo u={u} /><main><h1>Auditoria</h1><p className="soon">Últimos {logs.length} registros. Somente leitura.</p>
    <div className="card"><table><thead><tr><th>Quando</th><th>Quem</th><th>Ação</th><th>Empresa</th></tr></thead><tbody>
      {logs.map((l) => (<tr key={l.id}><td>{new Date(l.criado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</td><td>{l.usuario ?? '—'}</td><td>{l.acao}</td><td>{l.empresa ?? '—'}</td></tr>))}
    </tbody></table></div></main></>);
}
