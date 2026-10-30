import Link from 'next/link';
import { exigirUsuario } from '@/lib/session';
import { visaoGeral } from '@/lib/services/documentos';
import { query } from '@/lib/db';
import { cobrancasAbertas } from '@/lib/services/cobranca';
import { acaoCobrarDocumentos } from '../docs-actions';
import { Avisos, Topo, CompetenciaSeletor, competenciaDe } from '../../components';

export default async function Entregas({ searchParams }: { searchParams: Promise<{ competencia?: string; erro?: string; ok?: string }> }) {
  const u = await exigirUsuario('admin'); const sp = await searchParams; const comp = competenciaDe(sp.competencia);
  const [v, cobradas] = await Promise.all([visaoGeral(u, comp), cobrancasAbertas(u, comp)]);
  const novos = new Map((await query(`SELECT empresa_id, count(*)::int n FROM documentos_avulsos WHERE visto_em IS NULL AND removido_em IS NULL AND descartado_em IS NULL GROUP BY empresa_id`)).rows.map((r) => [r.empresa_id as string, r.n as number]));
  const concluidas = v.filter((e) => e.concluida).length, semConfig = v.filter((e) => e.exigidos === 0).length;
  return (<><Topo u={u} /><main>
    <p><Link href="/admin">← Início</Link></p>
    <div className="saudacao"><h1>Entregas do mês</h1><div className="row"><Link className="btn" href="/admin/empresas/nova">+ Cadastrar nova empresa</Link><Link className="btn sec" href="/admin/empresas">Todas as empresas</Link></div></div>
    <Avisos erro={sp.erro} ok={sp.ok} /><CompetenciaSeletor atual={comp} />
    <p className="soon legenda"><span className="ponto verde" /> enviou tudo · <span className="ponto vermelho" /> falta documento ou há recusado · <span className="ponto cinza" /> sem documentos configurados</p>
    <div className="grid">
      <div className="card"><h2>Concluídas</h2><strong style={{ fontSize: '2rem' }}>{concluidas}</strong><p className="soon">de {v.length} empresas ativas</p></div>
      <div className="card"><h2>Com pendências</h2><strong style={{ fontSize: '2rem' }}>{v.filter((e) => e.pendentes > 0).length}</strong></div>
      <div className="card"><h2>Com rejeitados</h2><strong style={{ fontSize: '2rem' }}>{v.filter((e) => e.rejeitados > 0).length}</strong></div>
      <div className="card"><h2>Sem documentos configurados</h2><strong style={{ fontSize: '2rem' }}>{semConfig}</strong></div>
    </div>
    <div className="card"><table><thead><tr><th>Empresa</th><th>Exigidos</th><th>Enviados</th><th>Aprovados</th><th>Rejeitados</th><th>Pendentes</th><th>%</th><th></th></tr></thead><tbody>
      {v.map((e) => { const estado = !e.exigidos ? 'cinza' : e.pendentes || e.rejeitados ? 'vermelho' : 'verde'; return (<tr key={e.id} className={`entrega-${estado}`}><td><Link href={`/admin/empresas/${e.id}`} title="Usuários, documentos, sócios e retiradas da empresa">{e.razao_social}</Link>{novos.get(e.id) ? <> <Link href={`/admin/empresas/${e.id}/documentos#outros`} className="tag" title="PDFs enviados pelo cliente que ainda não foram abertos">{novos.get(e.id)} PDF novo{novos.get(e.id)! > 1 ? 's' : ''}</Link></> : null}</td><td>{e.exigidos}</td><td>{e.enviados}</td><td>{e.aprovados}</td><td>{e.rejeitados}</td><td>{e.pendentes}</td><td>{e.percentual}%</td><td><div className="acoes-entrega"><Link href={`/admin/empresas/${e.id}/documentos?competencia=${comp}`}>Conferir</Link>
          {estado === 'vermelho' && (() => { const cb = cobradas.get(e.id); const dt = (d: Date) => new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }); return (<>
            {cb && <span className="cobrado" title={`1ª cobrança em ${dt(cb.criado_em)}. A solicitação está no painel do cliente e se encerra sozinha quando ele enviar tudo.`}><strong>Cobrado {cb.lembretes + 1}x</strong> · último em {dt(cb.ultimo)}</span>}
            <form action={acaoCobrarDocumentos}><input type="hidden" name="empresaId" value={e.id} /><input type="hidden" name="competencia" value={comp} /><button className="danger">{cb ? 'Cobrar de novo' : 'Cobrar envio'}</button></form></>); })()}</div></td></tr>); })}
      {!v.length && <tr><td colSpan={8} className="soon">Nenhuma empresa ativa.</td></tr>}</tbody></table></div>
  </main></>);
}
