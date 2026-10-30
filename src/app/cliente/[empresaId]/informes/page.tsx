import { notFound } from 'next/navigation';
import { exigirUsuario } from '@/lib/session';
import { obterEmpresa } from '@/lib/services/empresas';
import { listarInformesCliente } from '@/lib/services/informes';
import { listarRetiradas, sugestoesSocios, TIPOS_RETIRADA } from '@/lib/services/retiradas';
import { AppError } from '@/lib/errors';
import { Avisos, CompetenciaSeletor, Topo, competenciaDe } from '../../../components';
import { acaoEnviarRetiradas, acaoLancarRetirada, acaoRemoverRetirada } from '../../../retiradas-actions';

const brl = (n: number | string) => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBR = (d: string) => d.split('-').reverse().join('/');
const fimDoMes = (c: string) => { const [a, m] = c.split('-').map(Number); return `${c}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, '0')}`; };

/** Retiradas dos sócios: o cliente informa o que cada sócio retirou no mês e envia ao escritório. */
export default async function Retiradas({ params, searchParams }: { params: Promise<{ empresaId: string }>; searchParams: Promise<{ competencia?: string; erro?: string; ok?: string }> }) {
  const u = await exigirUsuario('cliente'); const { empresaId } = await params; const sp = await searchParams; const comp = competenciaDe(sp.competencia);
  let e, r, nomes, informes;
  try { [e, r, nomes, informes] = await Promise.all([obterEmpresa(u, empresaId), listarRetiradas(u, empresaId, comp), sugestoesSocios(u, empresaId), listarInformesCliente(u, empresaId)]); }
  catch (x) { if (x instanceof AppError) notFound(); throw x; }
  const [ano, mes] = comp.split('-'); const aberto = !r.envio; const h = { empresaId, competencia: comp };
  const ocultos = (<>{Object.entries(h).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}</>);
  return (<><Topo u={u} /><main><p><a href={`/cliente/${empresaId}?competencia=${comp}`}>← {e.razao_social}</a></p>
    <h1>Retiradas dos sócios</h1><Avisos erro={sp.erro} ok={sp.ok} />
    <p className="soon">Informe aqui tudo o que cada sócio retirou da empresa no mês: pró-labore, distribuição de lucros e outras retiradas. Depois clique em <strong>Enviar ao escritório</strong>.</p>
    <CompetenciaSeletor atual={comp} />
    {r.envio && <div className="msg-ok">{r.envio.sem_retiradas ? 'Você informou que não houve retiradas' : 'Retiradas enviadas ao escritório'} em {new Date(r.envio.enviado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}. Para corrigir, fale com o escritório.</div>}
    {aberto && <div className="card"><h2>Lançar retirada de {mes}/{ano}</h2>
      <form action={acaoLancarRetirada}>{ocultos}
        <div className="grid">
          <div><label htmlFor="data">Data *</label><input id="data" name="data" type="date" required min={`${comp}-01`} max={fimDoMes(comp)} /></div>
          <div><label htmlFor="socio">Sócio *</label><input id="socio" name="socio" list="socios" required minLength={2} maxLength={120} placeholder="Nome do sócio" />
            <datalist id="socios">{nomes.map((n) => <option key={n} value={n} />)}</datalist></div>
          <div><label htmlFor="tipo">Tipo *</label><select id="tipo" name="tipo" required defaultValue="">{<option value="" disabled>Escolha…</option>}{Object.entries(TIPOS_RETIRADA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <div><label htmlFor="valor">Valor (R$) *</label><input id="valor" name="valor" required inputMode="decimal" placeholder="1.500,00" /></div>
          <div><label htmlFor="observacao">Observação</label><input id="observacao" name="observacao" maxLength={200} placeholder="Opcional (ex.: PIX, conta pessoal)" /></div>
        </div><p><button>Lançar retirada</button></p></form></div>}
    <div className="card"><h2>Retiradas de {mes}/{ano}</h2>
      <table><thead><tr><th>Data</th><th>Sócio</th><th>Tipo</th><th style={{ textAlign: 'right' }}>Valor</th><th>Observação</th><th></th></tr></thead><tbody>
        {r.itens.map((i) => (<tr key={i.id}><td>{dataBR(i.data)}</td><td>{i.socio_nome}</td><td>{TIPOS_RETIRADA[i.tipo]}</td><td style={{ textAlign: 'right' }}>{brl(i.valor)}</td><td className="soon">{i.observacao}</td>
          <td>{aberto && <form action={acaoRemoverRetirada}>{ocultos}<input type="hidden" name="id" value={i.id} /><button className="sec">Excluir</button></form>}</td></tr>))}
        {!r.itens.length && <tr><td colSpan={6} className="soon">{r.envio?.sem_retiradas ? 'Não houve retiradas neste mês.' : 'Nenhuma retirada lançada neste mês.'}</td></tr>}
      </tbody></table>
      {r.totais.length > 0 && <><h3>Total por sócio</h3><table><thead><tr><th>Sócio</th><th style={{ textAlign: 'right' }}>Pró-labore</th><th style={{ textAlign: 'right' }}>Lucros</th><th style={{ textAlign: 'right' }}>Outras</th><th style={{ textAlign: 'right' }}>Total</th></tr></thead><tbody>
        {r.totais.map((t) => <tr key={t.socio}><td>{t.socio}</td><td style={{ textAlign: 'right' }}>{brl(t.pro_labore)}</td><td style={{ textAlign: 'right' }}>{brl(t.lucros)}</td><td style={{ textAlign: 'right' }}>{brl(t.outras)}</td><td style={{ textAlign: 'right' }}><strong>{brl(t.total)}</strong></td></tr>)}
        <tr><td><strong>Total do mês</strong></td><td colSpan={3}></td><td style={{ textAlign: 'right' }}><strong>{brl(r.total)}</strong></td></tr></tbody></table></>}
      <div className="row" style={{ marginTop: 12 }}>
        {aberto && r.itens.length > 0 && <form action={acaoEnviarRetiradas}>{ocultos}<button>Enviar ao escritório</button></form>}
        {aberto && !r.itens.length && <form action={acaoEnviarRetiradas}>{ocultos}<input type="hidden" name="sem" value="1" /><button className="sec">Não houve retiradas neste mês</button></form>}
        {r.itens.length > 0 && <a className="btn sec" href={`/api/retiradas/exportar?empresaId=${empresaId}&competencia=${comp}`}>Baixar Excel</a>}
      </div></div>
    {informes.length > 0 && <div className="card"><h2>Documentos do escritório</h2><table><thead><tr><th>Ano</th><th>Sócio</th><th>Documento</th><th></th></tr></thead><tbody>
      {informes.map((i) => (<tr key={i.id}><td>{i.ano_calendario}</td><td>{i.socio}<div className="soon">CPF {i.cpf_mascarado}</div></td><td>{i.tipo}{i.descricao && <div className="soon">{i.descricao}</div>}</td><td><a className="btn sec" href={`/api/informes/${i.id}`}>Baixar</a></td></tr>))}</tbody></table></div>}
  </main></>);
}
