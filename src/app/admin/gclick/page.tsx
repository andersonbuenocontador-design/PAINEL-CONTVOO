import Link from 'next/link';
import { exigirUsuario } from '@/lib/session';
import { previaGclick, statusGclick, type Previa } from '@/lib/services/gclick';
import { mensagemDeErro } from '@/lib/actions-util';
import { formatarCnpj } from '@/lib/cnpj';
import { Avisos, Topo } from '../../components';
import { acaoDesligarGclick, acaoImportarGclick, acaoSalvarGclick } from './actions';
import { MarcarTodas } from './MarcarTodas';

const fone = (w: string | null) => { if (!w) return '—'; const d = w.replace(/^55/, ''); return `(${d.slice(0, 2)}) ${d.slice(2, -4)}-${d.slice(-4)}`; };

/** G-Click: ligar (client_id/secret, segredo cifrado) e importar clientes para o painel pelo CNPJ. */
export default async function Gclick({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string; buscar?: string }> }) {
  const u = await exigirUsuario('admin'); const sp = await searchParams; const st = await statusGclick(u);
  let p: Previa | null = null, erro = '';
  if (st.ligado && sp.buscar) { try { p = await previaGclick(u); } catch (e) { erro = mensagemDeErro(e); } }
  const completar = p ? p.ligadas.filter((l) => l.whatsappNovo || l.apelidoNovo).length : 0;
  return (<><Topo u={u} /><main className="inicio emp">
    <p className="emp-voltar"><Link href="/admin">← Início</Link></p>
    <section className="inicio-ola"><div><h1>G-Click {st.ligado ? <span className="emp-situacao ativa">Ligado</span> : <span className="emp-situacao inativa">Desligado</span>}</h1>
      <p className="inicio-sub">Traz do G-Click o cadastro dos clientes (CNPJ, nome, apelido e celular) para o painel, sem digitar de novo.</p></div></section>
    <Avisos erro={sp.erro || erro} ok={sp.ok} />

    <section className="card emp-bloco"><h2>1. Acesso à API do G-Click</h2>
      <form action={acaoSalvarGclick} className="emp-form"><div className="grid">
        <div><label htmlFor="clientId">client_id *</label><input id="clientId" name="clientId" required defaultValue={st.clientId ?? ''} autoComplete="off" /></div>
        <div><label htmlFor="segredo">client_secret {st.ligado ? '' : '*'}</label><input id="segredo" name="segredo" type="password" autoComplete="off" required={!st.ligado} placeholder={st.ligado ? '•••••••• (guardado; cole outro só para trocar)' : 'Cole o client_secret'} /></div></div>
        <p className="soon">No G-Click: Configurações → API. São os mesmos do Contvoo Gestão (no Render dele: GCLICK_CLIENT_ID e GCLICK_CLIENT_SECRET). O segredo fica cifrado no banco do painel.</p>
        <button>Salvar acesso</button></form>
      {st.ligado && <form action={acaoDesligarGclick} style={{ marginTop: 10 }}><button className="link-perigo">Desligar e apagar a chave</button></form>}
    </section>

    {st.ligado && <section className="card emp-bloco"><h2>2. Clientes do G-Click</h2>
      {!p ? <><p className="soon">Busca todos os clientes do G-Click e compara com as empresas do painel pelo CNPJ. Nada é gravado antes de você confirmar.</p>
        <Link className="doc2-btn primario" href="/admin/gclick?buscar=1">Buscar clientes no G-Click</Link></> : <form action={acaoImportarGclick} className="emp-form">
        <p><strong>{p.ligadas.length}</strong> empresa(s) do painel encontradas no G-Click{completar ? <> · <strong>{completar}</strong> vão ganhar WhatsApp/nome fantasia que estavam vazios</> : ''} · <strong>{p.novas.length}</strong> cliente(s) do G-Click que não estão no painel{p.semCnpj ? ` · ${p.semCnpj} sem CNPJ (pessoa física) ficam de fora` : ''}.</p>
        <p className="soon">Ao confirmar, as empresas encontradas ficam ligadas ao G-Click e recebem só o que estiver vazio no painel (nada é sobrescrito). Das novas, marque as que quer cadastrar.</p>
        {p.novas.length > 0 && <div className="gclick-lista"><table><thead><tr><th><MarcarTodas /></th><th>Cliente no G-Click</th><th>CNPJ</th><th>Celular</th><th>Situação</th></tr></thead><tbody>
          {p.novas.map((n) => (<tr key={n.gclickId}><td><input type="checkbox" name="gclickId" value={n.gclickId} /></td><td><strong>{n.nome}</strong>{n.apelido && n.apelido !== n.nome && <div className="soon">{n.apelido}</div>}</td><td>{formatarCnpj(n.cnpj)}</td><td>{fone(n.whatsapp)}</td><td className="soon">{n.status ?? '—'}</td></tr>))}
        </tbody></table></div>}
        <div className="row"><button className="doc2-btn primario">Confirmar: ligar empresas e cadastrar as marcadas</button><Link className="doc2-btn leve" href="/admin/gclick">Cancelar</Link></div>
      </form>}
    </section>}
    {st.ligado && <section className="card emp-bloco"><h2>3. Solicitação de documentos</h2>
      <p className="soon">Em dois cliques: ✔ no G-Click para os clientes com e-mail (o G-Click manda o e-mail) e a mensagem padrão pelo WhatsApp para quem não tem e-mail.</p>
      <Link className="doc2-btn primario" href="/admin/gclick/solicitacao">Abrir a solicitação de documentos</Link></section>}
  </main></>);
}
