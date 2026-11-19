import Link from 'next/link';
import { exigirUsuario } from '@/lib/session';
import { listarConexoes, statusDigisac, type Conexao } from '@/lib/services/digisac';
import { mensagemDeErro } from '@/lib/actions-util';
import { lerMensagemCobranca } from '@/lib/services/mensagem';
import { EditorMensagem } from './EditorMensagem';
import { Avisos, Topo } from '../../components';
import { acaoDesligarDigisac, acaoEscolherConexao, acaoSalvarDigisac, acaoTesteDigisac } from './actions';

/** Configuração do WhatsApp pelo Digisac: endereço + chave da API (cifrada no banco), conexão e envio de teste. */
export default async function WhatsappDigisac({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string }> }) {
  const u = await exigirUsuario('admin'); const sp = await searchParams; const [st, msg] = await Promise.all([statusDigisac(u), lerMensagemCobranca()]);
  let conexoes: Conexao[] = [], erroLista = '';
  if (st.temChave) { try { conexoes = await listarConexoes(u); } catch (e) { erroLista = mensagemDeErro(e); } }
  return (<><Topo u={u} /><main className="emp">
    <p className="emp-voltar"><Link href="/admin/entregas">← Entregas do mês</Link></p>
    <h1>WhatsApp pelo Digisac {st.pronto ? <span className="emp-situacao ativa">Ligado</span> : <span className="emp-situacao inativa">Desligado</span>}</h1>
    <p className="soon"><a href="#mensagem">Editar a mensagem de cobrança ↓</a></p>
    <p className="soon">Com o Digisac ligado, o botão <strong>"Cobrar envio"</strong> em Entregas do mês manda a mensagem sozinho pelo WhatsApp do escritório, sem abrir o WhatsApp. Desligado, ele abre o WhatsApp com a mensagem pronta.</p>
    <Avisos erro={sp.erro} ok={sp.ok} />

    <section className="card emp-bloco"><h2>1. Acesso ao Digisac</h2>
      <form action={acaoSalvarDigisac} className="emp-form">
        <div className="grid">
          <div><label htmlFor="url">Endereço da conta *</label><input id="url" name="url" required defaultValue={st.url ?? 'https://contvoocontabilidade.digisac.biz'} placeholder="https://suaempresa.digisac.biz" /></div>
          <div><label htmlFor="token">Chave (token) da API {st.temChave ? '' : '*'}</label><input id="token" name="token" type="password" autoComplete="off" placeholder={st.temChave ? '•••••••• (guardada; cole outra só para trocar)' : 'Cole aqui a chave da API do Digisac'} required={!st.temChave} /></div>
        </div>
        <p className="soon">A chave fica guardada cifrada no banco do painel e nunca aparece de novo na tela.</p>
        <button>Salvar acesso</button></form></section>

    {st.temChave && <section className="card emp-bloco"><h2>2. Conexão do WhatsApp</h2>
      {erroLista ? <><div className="msg-err">{erroLista}</div>
        <form action={acaoEscolherConexao} className="emp-form"><label htmlFor="conexao-manual">Ou informe o ID da conexão à mão (Digisac → Conexões → a conexão do WhatsApp)</label>
          <div className="row"><input id="conexao-manual" name="conexao" required placeholder="ID da conexão" style={{ flex: 1 }} defaultValue={st.serviceId ?? ''} /><button>Usar este ID</button></div></form></> : <form action={acaoEscolherConexao} className="emp-form">
        <label htmlFor="conexao">Por qual número/conexão as mensagens saem?</label>
        <select id="conexao" name="conexao" required defaultValue={st.serviceId ? `${st.serviceId}|${st.serviceNome ?? ''}` : ''}>
          <option value="" disabled>Escolha a conexão</option>
          {conexoes.map((c) => <option key={c.id} value={`${c.id}|${c.nome}`}>{c.nome}{c.tipo ? ` (${c.tipo})` : ''}</option>)}</select>
        {!conexoes.length && <p className="soon">Nenhuma conexão encontrada nesta conta Digisac.</p>}
        <button>Usar esta conexão</button></form>}
      {st.serviceId && <p className="soon">Conexão atual: <strong>{st.serviceNome ?? st.serviceId}</strong></p>}</section>}

    {st.pronto && <section className="card emp-bloco"><h2>3. Envio de teste</h2>
      <form action={acaoTesteDigisac} className="row"><input name="numero" required inputMode="tel" placeholder="Seu WhatsApp, ex.: (51) 99999-9999" style={{ flex: 1 }} /><button>Enviar teste</button></form>
      <p className="soon">Mande para o seu próprio número antes de cobrar os clientes.</p></section>}

    <section className="card emp-bloco" id="mensagem"><h2>{st.pronto ? '4. ' : ''}Mensagem de cobrança {msg.personalizada ? <span className="emp-situacao ativa">Personalizada</span> : <span className="emp-situacao inativa">Padrão</span>}</h2>
      <p className="soon">É o texto que o botão "Cobrar envio" manda no WhatsApp. Os marcadores entre chaves são trocados pelos dados de cada cliente.</p>
      <EditorMensagem inicial={msg.texto} personalizada={msg.personalizada} /></section>

    {st.temChave && <form action={acaoDesligarDigisac} style={{ marginTop: 10 }}><button className="link-perigo">Desligar e apagar a chave do Digisac</button></form>}
  </main></>);
}
