import { exigirUsuario } from '@/lib/session';
import { query } from '@/lib/db';
import { relatorioRetencao } from '@/lib/services/lgpd';
import { Avisos, Topo } from '../../components';
import { acaoAnonimizar, acaoDescartar } from '../../lgpd-actions';

const mb = (b: number) => `${(b / 1048576).toFixed(1).replace('.', ',')} MB`;
export default async function Lgpd({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string }> }) {
  const u = await exigirUsuario('admin'); const sp = await searchParams;
  const [r, usuarios, log] = await Promise.all([relatorioRetencao(u), query(`SELECT id,nome,email,papel,ativo FROM usuarios WHERE email NOT LIKE '%@anonimizado.invalid' ORDER BY nome`), query(`SELECT a.criado_em,a.acao,u.nome FROM auditoria a LEFT JOIN usuarios u ON u.id=a.usuario_id WHERE a.acao LIKE 'lgpd.%' ORDER BY a.id DESC LIMIT 30`)]);
  const total = r.documentos.qtd + r.informes.qtd;
  return (<><Topo u={u} /><main><h1>LGPD: retenção e direitos do titular</h1><Avisos erro={sp.erro} ok={sp.ok} />
    <div className="card"><h2>Retenção de arquivos</h2>
      <p>Prazo de guarda configurado: <strong>{r.anos} ano(s)</strong> após o fim do período do documento (variável <code>RETENCAO_ANOS</code>). <span className="soon">O prazo correto deve ser definido pelo escritório com seu jurídico/encarregado de dados.</span></p>
      <p>Vencidos: <strong>{r.documentos.qtd}</strong> documento(s) mensais ({mb(r.documentos.bytes)}) e <strong>{r.informes.qtd}</strong> arquivo(s) de informes ({mb(r.informes.bytes)}). Já descartados antes: {r.jaDescartados}.</p>
      <p className="soon">Descartar apaga só o <em>conteúdo</em> dos arquivos. Os registros (nome, data, quem enviou) e a auditoria permanecem. Não dá para desfazer: faça o backup antes.</p>
      <form action={acaoDescartar} className="row"><div><label>Digite DESCARTAR para confirmar</label><input name="confirmacao" autoComplete="off" disabled={!total} /></div><button className="danger" disabled={!total}>Descartar arquivos vencidos</button></form></div>
    <div className="card"><h2>Dados de uma pessoa (usuário)</h2><p className="soon">Exportar entrega uma cópia em JSON dos dados pessoais (sem senha nem 2FA). Anonimizar remove nome, e-mail, acesso e vínculos, mantendo só o registro técnico para a auditoria.</p>
      <table><thead><tr><th>Usuário</th><th>Tipo</th><th></th></tr></thead><tbody>{usuarios.rows.map((x) => (<tr key={x.id}><td>{x.nome}<div className="soon">{x.email}</div></td><td>{x.papel}{!x.ativo && <span className="tag off"> bloqueado</span>}</td>
        <td><div className="row"><a className="btn sec" href={`/api/lgpd/exportar?usuarioId=${x.id}`}>Exportar dados</a>{x.id !== u.id && <form action={acaoAnonimizar} className="row"><input type="hidden" name="usuarioId" value={x.id} /><input name="confirmacao" placeholder="digite ANONIMIZAR" autoComplete="off" style={{ width: 170 }} /><button className="danger">Anonimizar</button></form>}</div></td></tr>))}</tbody></table></div>
    <div className="card"><h2>Registro das operações de LGPD</h2><table><tbody>{log.rows.map((l, i) => (<tr key={i}><td>{new Date(l.criado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</td><td>{l.nome ?? '—'}</td><td>{l.acao}</td></tr>))}{!log.rows.length && <tr><td className="soon">Nenhuma operação registrada.</td></tr>}</tbody></table></div></main></>);
}
