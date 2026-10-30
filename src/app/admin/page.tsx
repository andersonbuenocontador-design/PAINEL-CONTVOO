import { exigirUsuario } from '@/lib/session';
import { resumoEscritorio } from '@/lib/services/hub';
import { Atalho, CompetenciaSeletor, Topo, competenciaDe } from '../components';

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** Tela inicial do escritório: um cartão por área, com o que pede atenção. */
export default async function AdminHub({ searchParams }: { searchParams: Promise<{ competencia?: string }> }) {
  const u = await exigirUsuario('admin'); const comp = competenciaDe((await searchParams).competencia); const c = `?competencia=${comp}`;
  const r = await resumoEscritorio(u, comp); const [ano, mes] = comp.split('-');
  return (<><Topo u={u} /><main>
    <div className="saudacao"><div><h1>{u.nome === 'Administrador' || u.nome.startsWith('Contvoo') ? 'Contvoo Contabilidade' : `Olá, ${u.nome.split(' ')[0]}`}</h1><p className="soon" style={{ margin: '4px 0 0' }}>Competência {mes}/{ano}</p></div><CompetenciaSeletor atual={comp} mini /></div>
    <div className="hub">
      <Atalho href={`/admin/entregas${c}`} icone="entrega" titulo="Entregas do mês" desc="Empresas, documentos e cadastro de novas empresas"
        info={[r.a_conferir ? `${plural(r.a_conferir, 'documento', 'documentos')} para conferir` : `${r.entregasConcluidas} de ${r.empresas} empresas concluídas`, r.pdfs_novos ? plural(r.pdfs_novos, 'PDF novo', 'PDFs novos') : ''].filter(Boolean).join(' · ')}
        alerta={r.a_conferir > 0 || r.pdfs_novos > 0} ok={!r.a_conferir && !r.pdfs_novos && r.empresas > 0 && r.entregasConcluidas === r.empresas} />
      <Atalho href={`/admin/conciliacoes${c}`} icone="banco" titulo="Conciliações" desc="Extratos classificados pelos clientes"
        info={r.conciliacoes ? `${plural(r.conciliacoes, 'aguardando', 'aguardando')} sua conferência` : 'Nenhuma aguardando conferência'} alerta={r.conciliacoes > 0} />
      <Atalho href="/admin/pendencias" icone="conversa" titulo="Pendências" desc="Solicitações aos clientes e respostas"
        info={r.pendencias ? `${plural(r.pendencias, 'resposta', 'respostas')} de cliente para ver` : 'Nenhuma resposta nova'} alerta={r.pendencias > 0} />
      <Atalho href="/admin/relatorios" icone="grafico" titulo="Relatórios" desc="Visão geral e exportações em Excel" />
      <Atalho href="/admin/usuarios" icone="pessoas" titulo="Usuários" desc="Acessos do escritório e dos clientes" info={plural(r.usuarios, 'usuário ativo', 'usuários ativos')} />
    </div>
  </main></>);
}
