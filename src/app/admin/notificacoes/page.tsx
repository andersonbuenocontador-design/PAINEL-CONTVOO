import { exigirUsuario } from '@/lib/session';
import { query } from '@/lib/db';
import { provedorPadrao } from '@/lib/notificacoes';
import { Avisos, Topo } from '../../components';
import { acaoProcessarNotificacoes } from '../../pendencias-actions';

export default async function Notificacoes({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string }> }) {
  const u = await exigirUsuario('admin'); const sp = await searchParams;
  const [st, recentes] = await Promise.all([
    query(`SELECT count(*) FILTER (WHERE status='pendente')::int pendentes, count(*) FILTER (WHERE status='enviada')::int enviadas, count(*) FILTER (WHERE status='falha')::int falhas, count(*) FILTER (WHERE status='cancelada')::int canceladas FROM notificacoes`),
    query(`SELECT n.id,n.tipo,n.assunto,n.status,n.tentativas,n.erro,n.criado_em,n.enviada_em,u.nome,u.email FROM notificacoes n JOIN usuarios u ON u.id=n.destinatario_id ORDER BY n.id DESC LIMIT 60`),
  ]);
  const ativo = !!provedorPadrao(); const s = st.rows[0];
  return (<><Topo u={u} /><main><h1>Notificações por e-mail</h1><Avisos erro={sp.erro} ok={sp.ok} />
    <div className={ativo ? 'msg-ok' : 'msg-err'}>{ativo ? 'Envio de e-mails configurado (SMTP).' : 'Envio de e-mails NÃO configurado: os avisos ficam na fila e saem quando o provedor for configurado (variáveis EMAIL_PROVIDER=smtp, SMTP_URL e EMAIL_FROM).'}</div>
    <div className="grid"><div className="card"><h2>Na fila</h2><strong style={{ fontSize: '2rem' }}>{s.pendentes}</strong></div><div className="card"><h2>Enviadas</h2><strong style={{ fontSize: '2rem' }}>{s.enviadas}</strong></div><div className="card"><h2>Com falha</h2><strong style={{ fontSize: '2rem' }}>{s.falhas}</strong></div><div className="card"><h2>Canceladas</h2><strong style={{ fontSize: '2rem' }}>{s.canceladas}</strong></div></div>
    <form action={acaoProcessarNotificacoes}><button>Gerar lembretes e enviar agora</button> <span className="soon">Em produção, agende uma chamada a POST /api/notificacoes/processar (cabeçalho Authorization: Bearer CRON_SECRET) uma vez por hora.</span></form>
    <div className="card"><h2>Últimos avisos</h2><p className="soon">Os e-mails nunca levam documentos, valores ou dados bancários: só avisam e apontam para o painel.</p><table><thead><tr><th>Quando</th><th>Para</th><th>Assunto</th><th>Situação</th></tr></thead><tbody>
      {recentes.rows.map((n) => (<tr key={n.id}><td>{new Date(n.criado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</td><td>{n.nome}<div className="soon">{n.email}</div></td><td>{n.assunto}</td><td><span className="tag">{n.status}</span>{n.tentativas > 0 && <div className="soon">{n.tentativas} tentativa(s)</div>}{n.erro && <div className="soon">{n.erro}</div>}</td></tr>))}
      {!recentes.rows.length && <tr><td colSpan={4} className="soon">Nenhum aviso gerado ainda.</td></tr>}</tbody></table></div></main></>);
}
