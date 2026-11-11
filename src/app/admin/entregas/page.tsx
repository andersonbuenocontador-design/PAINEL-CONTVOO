import Link from 'next/link';
import { exigirUsuario } from '@/lib/session';
import { visaoGeral } from '@/lib/services/documentos';
import { query } from '@/lib/db';
import { cobrancasAbertas } from '@/lib/services/cobranca';
import { pendenciasDoMes } from '@/lib/services/integracao';
import { BotaoCobrar } from './BotaoCobrar';
import { Avisos, Topo, CompetenciaSeletor, competenciaDe } from '../../components';

export default async function Entregas({ searchParams }: { searchParams: Promise<{ competencia?: string; erro?: string; ok?: string }> }) {
  const u = await exigirUsuario('admin'); const sp = await searchParams; const comp = competenciaDe(sp.competencia);
  const [v, cobradas, zap] = await Promise.all([visaoGeral(u, comp), cobrancasAbertas(u, comp), pendenciasDoMes(comp, false)]);
  const msg = new Map(zap.todas.map((x) => [x.empresaId, x]));
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
    <div className="card ent-tabela"><table><thead><tr><th>Empresa</th><th>Andamento</th><th>Situação</th><th></th></tr></thead><tbody>
      {v.map((e) => {
        const estado = !e.exigidos ? 'cinza' : e.pendentes || e.rejeitados ? 'vermelho' : 'verde';
        const aConferir = e.enviados - e.aprovados - e.rejeitados; const nov = novos.get(e.id) ?? 0;
        const cb = cobradas.get(e.id); const dt = (d: Date) => new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
        return (<tr key={e.id} className={`ent-linha ent-${estado}`}>
          <td><Link className="ent-nome" href={`/admin/empresas/${e.id}`} title="Usuários, documentos, sócios e retiradas da empresa">{e.razao_social}</Link>
            {nov > 0 && <Link href={`/admin/empresas/${e.id}/documentos#outros`} className="ent-novo" title="Arquivos enviados pelo cliente que ainda não foram abertos">{nov} arquivo{nov > 1 ? 's' : ''} novo{nov > 1 ? 's' : ''}</Link>}</td>
          <td className="ent-andamento">{e.exigidos ? <>
            <div className="ent-barra" role="progressbar" aria-valuenow={e.percentual} aria-valuemin={0} aria-valuemax={100} aria-label="Documentos aprovados"><div style={{ width: `${e.percentual}%` }} /></div>
            <span>{e.aprovados} de {e.exigidos} aprovado{e.exigidos > 1 ? 's' : ''}</span></> : <span className="soon">Sem documentos configurados</span>}</td>
          <td><div className="ent-chips">
            {e.concluida && <span className="ent-chip ok">Concluída</span>}
            {e.pendentes > 0 && <span className="ent-chip falta">Falta {e.pendentes}</span>}
            {e.rejeitados > 0 && <span className="ent-chip recusado">{e.rejeitados} recusado{e.rejeitados > 1 ? 's' : ''}</span>}
            {aConferir > 0 && <span className="ent-chip conferir">{aConferir} para conferir</span>}
            </div>
            {estado === 'vermelho' && cb && <div className="ent-cobrado" title={`1ª cobrança em ${dt(cb.criado_em)}. A solicitação está no painel do cliente e se encerra sozinha quando ele enviar tudo.`}>Cobrado {cb.lembretes + 1}x · último em {dt(cb.ultimo)}</div>}</td>
          <td><div className="ent-acoes">
            {estado === 'vermelho' && <BotaoCobrar empresaId={e.id} competencia={comp} rotulo={cb ? 'Cobrar de novo' : 'Cobrar envio'} whatsapp={msg.get(e.id)?.whatsapp} mensagem={msg.get(e.id)?.mensagem} />}
            <Link className={`ent-btn ${aConferir > 0 || nov > 0 ? 'principal' : ''}`} href={`/admin/empresas/${e.id}/documentos?competencia=${comp}`}>{aConferir > 0 ? 'Conferir' : 'Abrir'}</Link></div></td>
        </tr>); })}
      {!v.length && <tr><td colSpan={4} className="soon">Nenhuma empresa ativa.</td></tr>}</tbody></table></div>
  </main></>);
}
