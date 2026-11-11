import Link from 'next/link';
import { notFound } from 'next/navigation';
import { exigirUsuario } from '@/lib/session';
import { compararRetiradas, FOLGA_DIAS, motivoSuspeita } from '@/lib/services/lucros';
import { AppError } from '@/lib/errors';
import { Avisos, CompetenciaSeletor, Topo, competenciaDe } from '../../../components';
import { acaoDesfazerNaoERetirada, acaoDevolverLucros, acaoNaoERetirada } from '../../../lucros-actions';
import { brl, brlCent, dataBR, STATUS_LUCROS } from '../util';

/** Detalhe de uma empresa: retirada por retirada, o que o cliente informou × o que está no extrato. */
export default async function LucrosEmpresa({ params, searchParams }: { params: Promise<{ empresaId: string }>; searchParams: Promise<{ competencia?: string; erro?: string; ok?: string }> }) {
  const u = await exigirUsuario('admin'); const { empresaId } = await params; const sp = await searchParams; const comp = competenciaDe(sp.competencia);
  let c; try { c = await compararRetiradas(u, empresaId, comp); } catch (x) { if (x instanceof AppError) notFound(); throw x; }
  const r = c.resumo; const [ano, mes] = comp.split('-');
  const oc = (<><input type="hidden" name="empresaId" value={empresaId} /><input type="hidden" name="competencia" value={comp} /></>);
  const origem = (o: string | null) => o ?? <span className="soon">não informado</span>;
  return (<><Topo u={u} /><main className="lucros">
    <p><Link href={`/admin/lucros?competencia=${comp}`}>← Lucros dos sócios</Link></p>
    <h1>{c.empresa.razao_social}</h1><Avisos erro={sp.erro} ok={sp.ok} />
    <CompetenciaSeletor atual={comp} />
    <div className={`card lucros-topo ${STATUS_LUCROS[c.status].cls}`}>
      <div><span className={`chip-lucro ${STATUS_LUCROS[c.status].cls}`}>{STATUS_LUCROS[c.status].txt}</span>
        <h2>Retiradas de lucro — {mes}/{ano}</h2>
        <p className="soon">{c.envio ? (c.envio.sem_retiradas ? `Cliente informou que não houve retiradas (${c.envio.enviado_por}).` : `Cliente enviou o mês (${c.envio.enviado_por}).`) : r.informadas ? 'Cliente ainda está lançando (não enviou).' : 'Cliente ainda não informou nada neste mês.'}
          {!r.extratoNoMes && ' O extrato bancário deste mês ainda não chegou: a comparação fica completa quando ele for importado.'}</p></div>
      <dl className="lucros-numeros">
        <div><dt>Informado</dt><dd>{brlCent(r.totalInformado)}</dd></div>
        <div><dt>Conferidas</dt><dd>{r.conferidas} de {r.informadas}</dd></div>
        <div className={r.esquecidas ? 'alerta' : ''}><dt>Possíveis esquecidas</dt><dd>{r.esquecidas}{r.esquecidas ? ` · ${brlCent(r.totalEsquecido)}` : ''}</dd></div>
        <div className={r.naoEncontradas + r.divergentes ? 'alerta' : ''}><dt>Não achadas / valor diferente</dt><dd>{r.naoEncontradas} / {r.divergentes}</dd></div>
      </dl>
    </div>

    {c.acimaDoLimite.length > 0 && <div className="aviso-lucros" role="alert"><h2>Acima de R$ 50.000,00 no mês</h2>
      {c.acimaDoLimite.map((a) => <p key={a.socio}><strong>{a.socio}</strong>: {brlCent(a.total)} somando o informado e o que parece esquecido no extrato. Verifique a retenção de 10% de IRRF (Lei 15.270/2025).</p>)}</div>}

    <section className="card" id="esquecidas"><h2>Possíveis retiradas esquecidas <span className="soon">({c.esquecidas.length})</span></h2>
      <p className="soon">Saídas do extrato que parecem ser para um sócio (nome ou CPF na descrição, ou categoria de lucros/retirada) e que o cliente não informou.</p>
      {c.esquecidas.length ? <table><thead><tr><th>Data</th><th>Banco</th><th>Descrição no extrato</th><th style={{ textAlign: 'right' }}>Valor</th><th>Por que parece retirada</th><th></th></tr></thead><tbody>
        {c.esquecidas.map((m) => (<tr key={m.id} className="lucros-linha-alerta"><td>{dataBR(m.data)}</td><td>{m.banco}</td><td className="mono">{m.descricao}</td><td style={{ textAlign: 'right' }}><strong>{brlCent(m.valor)}</strong></td><td className="soon">{motivoSuspeita(m)}</td>
          <td><details className="lucros-ignorar"><summary>Não é retirada</summary><form action={acaoNaoERetirada} className="row">{oc}<input type="hidden" name="movId" value={m.id} /><input name="motivo" maxLength={200} placeholder="Motivo (ex.: reembolso, empréstimo)" /><button className="sec">Confirmar</button></form></details></td></tr>))}
      </tbody></table> : <p className="lucros-vazio">{r.extratoNoMes ? 'Nada suspeito no extrato: tudo o que parece retirada foi informado.' : 'Aguardando o extrato do mês.'}</p>}
      {c.esquecidas.length > 0 && c.envio && !c.envio.sem_retiradas && <form action={acaoDevolverLucros} style={{ marginTop: 10 }}>{oc}<button>Devolver ao cliente para completar</button> <span className="soon">O cliente volta a poder lançar e enviar o mês.</span></form>}
      {c.esquecidas.length > 0 && c.envio?.sem_retiradas && <form action={acaoDevolverLucros} style={{ marginTop: 10 }}>{oc}<button>Devolver ao cliente</button> <span className="soon">Ele informou que não houve retiradas, mas o extrato mostra saídas para sócio.</span></form>}
    </section>

    {(c.divergentes.length > 0 || c.naoEncontradas.length > 0) && <section className="card"><h2>Informadas que não batem com o extrato</h2>
      <table><thead><tr><th>Data informada</th><th>Sócio</th><th>De onde saiu</th><th style={{ textAlign: 'right' }}>Informado</th><th>No extrato</th></tr></thead><tbody>
        {c.divergentes.map((d) => (<tr key={d.informada.id} className="lucros-linha-alerta"><td>{dataBR(d.informada.data)}</td><td>{d.informada.socio_nome}</td><td>{origem(d.informada.origem)}</td><td style={{ textAlign: 'right' }}>{brl(d.informada.valor)}</td>
          <td><strong>Valor diferente:</strong> {brlCent(d.extrato.valor)} em {dataBR(d.extrato.data)} ({d.diferenca > 0 ? '+' : '−'}{brlCent(Math.abs(d.diferenca))})<div className="soon mono">{d.extrato.banco} · {d.extrato.descricao}</div></td></tr>))}
        {c.naoEncontradas.map((i) => (<tr key={i.id}><td>{dataBR(i.data)}</td><td>{i.socio_nome}</td><td>{origem(i.origem)}</td><td style={{ textAlign: 'right' }}>{brl(i.valor)}</td>
          <td><strong>Não encontrada</strong><div className="soon">Nenhuma saída de mesmo valor até {FOLGA_DIAS} dias da data{i.conta_id ? ' nesta conta ou em outra' : ''}. Pode ter saído de outro banco, em outra data ou não ter acontecido.</div></td></tr>))}
      </tbody></table></section>}

    <section className="card"><h2>Conferidas <span className="soon">({c.conferidas.length})</span></h2>
      {c.conferidas.length ? <table><thead><tr><th>Data informada</th><th>Sócio</th><th>De onde saiu</th><th style={{ textAlign: 'right' }}>Valor</th><th>No extrato</th></tr></thead><tbody>
        {c.conferidas.map((x) => (<tr key={x.informada.id}><td>{dataBR(x.informada.data)}</td><td>{x.informada.socio_nome}</td><td>{origem(x.informada.origem)}</td><td style={{ textAlign: 'right' }}>{brl(x.informada.valor)}</td>
          <td><span className="chip-lucro ok">✓ {x.saque ? 'Saque' : 'Confere'}</span> {dataBR(x.extrato.data)}{x.dias ? ` (${x.dias} dia${x.dias > 1 ? 's' : ''} de diferença)` : ''}
            {x.contaDiferente && <div className="lucros-atencao">Saiu do {x.extrato.banco}, não da conta informada</div>}
            <div className="soon mono">{x.extrato.descricao}</div></td></tr>))}
      </tbody></table> : <p className="soon">Nenhuma ainda.</p>}</section>

    {(c.emDinheiro.length > 0 || c.aguardandoExtrato.length > 0) && <section className="card"><h2>Sem como conferir no extrato</h2>
      <table><thead><tr><th>Data</th><th>Sócio</th><th>De onde saiu</th><th style={{ textAlign: 'right' }}>Valor</th><th></th></tr></thead><tbody>
        {c.emDinheiro.map((i) => <tr key={i.id}><td>{dataBR(i.data)}</td><td>{i.socio_nome}</td><td>Dinheiro</td><td style={{ textAlign: 'right' }}>{brl(i.valor)}</td><td className="soon">Em espécie e sem saque correspondente no extrato: confira o caixa.</td></tr>)}
        {c.aguardandoExtrato.map((i) => <tr key={i.id}><td>{dataBR(i.data)}</td><td>{i.socio_nome}</td><td>{origem(i.origem)}</td><td style={{ textAlign: 'right' }}>{brl(i.valor)}</td><td className="soon">Extrato desta conta ainda não chegou.</td></tr>)}
      </tbody></table></section>}

    {c.ignoradas.length > 0 && <details className="card"><summary>Marcadas como “não é retirada” ({c.ignoradas.length})</summary>
      <table><tbody>{c.ignoradas.map((m) => (<tr key={m.id}><td>{dataBR(m.data)}</td><td className="mono">{m.descricao}</td><td style={{ textAlign: 'right' }}>{brlCent(m.valor)}</td><td className="soon">{m.motivo_ignorada}</td>
        <td><form action={acaoDesfazerNaoERetirada}>{oc}<input type="hidden" name="movId" value={m.id} /><button className="sec">Desfazer</button></form></td></tr>))}</tbody></table></details>}

    <p className="soon">Como a comparação funciona: mesmo valor, até {FOLGA_DIAS} dias de diferença na data, com preferência para a conta informada e para a descrição que cita o sócio. Retirada em dinheiro só confere com saque. Sócios reconhecidos: {c.socios.join(', ') || 'nenhum cadastrado'} (<Link href={`/admin/empresas/${empresaId}/informes?competencia=${comp}`}>cadastrar sócios com CPF</Link> melhora a busca).</p>
  </main></>);
}
