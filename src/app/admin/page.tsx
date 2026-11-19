import Link from 'next/link';
import {
  ArrowRight, Banknote, Building2, CircleHelp, ClipboardList, FileBarChart, KeyRound, Landmark, Layers, MessageCircle, MessagesSquare, ScrollText, ShieldCheck,
} from 'lucide-react';
import { exigirUsuario } from '@/lib/session';
import { resumoEscritorio } from '@/lib/services/hub';
import { digisacPronto } from '@/lib/services/digisac';
import { CompetenciaSeletor, Topo, competenciaDe, saudacaoDoHorario } from '../components';

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** Tela inicial do escritório: o que pede atenção no alto, o trabalho do mês em cartões grandes e todos os cadastros e ajustes embaixo. */
export default async function AdminHub({ searchParams }: { searchParams: Promise<{ competencia?: string }> }) {
  const u = await exigirUsuario('admin'); const comp = competenciaDe((await searchParams).competencia); const c = `?competencia=${comp}`;
  const [r, zap] = await Promise.all([resumoEscritorio(u, comp), digisacPronto()]); const [ano, mes] = comp.split('-');
  const nome = u.nome === 'Administrador' || u.nome.startsWith('Contvoo') ? 'Contvoo Contabilidade' : u.nome.split(' ')[0];
  const d = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: 'numeric', month: 'long' }); const hoje = d.charAt(0).toUpperCase() + d.slice(1);
  const pct = r.comDocs ? Math.round((r.enviaramTudo / r.comDocs) * 100) : 0;
  const atencao = [
    r.a_conferir && { href: `/admin/entregas${c}`, n: r.a_conferir, txt: r.a_conferir === 1 ? 'documento para conferir' : 'documentos para conferir', tom: 'azul' },
    r.conciliacoes && { href: `/admin/conciliacoes${c}&so=enviada`, n: r.conciliacoes, txt: r.conciliacoes === 1 ? 'conciliação aguardando você' : 'conciliações aguardando você', tom: 'azul' },
    r.pendencias && { href: '/admin/pendencias', n: r.pendencias, txt: r.pendencias === 1 ? 'resposta de cliente' : 'respostas de clientes', tom: 'azul' },
    r.pdfs_novos && { href: `/admin/entregas${c}`, n: r.pdfs_novos, txt: r.pdfs_novos === 1 ? 'arquivo novo dos clientes' : 'arquivos novos dos clientes', tom: 'azul' },
    r.comDocs - r.enviaramTudo > 0 && { href: `/admin/entregas${c}`, n: r.comDocs - r.enviaramTudo, txt: r.comDocs - r.enviaramTudo === 1 ? 'empresa ainda não enviou tudo' : 'empresas ainda não enviaram tudo', tom: 'laranja' },
  ].filter(Boolean) as { href: string; n: number; txt: string; tom: string }[];
  return (<><Topo u={u} /><main className="inicio">
    <section className="inicio-ola">
      <div><p className="inicio-data">{hoje}</p><h1>{saudacaoDoHorario()}, {nome}!</h1>
        <p className="inicio-sub">Competência <strong>{MESES[Number(mes) - 1]} de {ano}</strong> · {plural(r.empresas, 'empresa ativa', 'empresas ativas')}</p></div>
      <CompetenciaSeletor atual={comp} mini />
    </section>

    <section className="inicio-atencao" aria-label="O que pede atenção">
      {atencao.length ? <><h2>Para fazer agora</h2><div className="inicio-chips">{atencao.map((a) => (
        <Link key={a.txt} href={a.href} className={`inicio-chip ${a.tom}`}><strong>{a.n}</strong> {a.txt} <ArrowRight size={14} /></Link>))}</div></>
        : <p className="inicio-tudo-certo">✓ Tudo em dia por aqui: nada esperando por você neste mês.</p>}
    </section>

    <h2 className="inicio-secao">Trabalho do mês</h2>
    <section className="inicio-grandes">
      <Link href={`/admin/entregas${c}`} className="inicio-cartao">
        <span className="ic laranja"><ClipboardList size={22} /></span>
        <div className="corpo"><strong>Entregas do mês</strong><span className="desc">Documentos pedidos aos clientes, conferência e cobrança</span>
          {r.comDocs ? <><div className="barra"><div style={{ width: `${pct}%` }} /></div><span className="num">{r.enviaramTudo} de {r.comDocs} empresas enviaram tudo</span></> : <span className="num">Nenhum documento pedido neste mês</span>}</div>
      </Link>
      <Link href={`/admin/conciliacoes${c}`} className="inicio-cartao">
        <span className="ic azul"><Landmark size={22} /></span>
        <div className="corpo"><strong>Conciliações</strong><span className="desc">Extratos classificados pelos clientes com o Contvoo AI</span>
          <span className="num">{r.conciliacoes ? <b className="alerta">{plural(r.conciliacoes, 'aguardando sua conferência', 'aguardando sua conferência')}</b> : 'Nenhuma aguardando conferência'} · {plural(r.conc_concluidas, 'concluída', 'concluídas')} · {plural(r.com_extrato, 'empresa com extrato', 'empresas com extrato')}</span></div>
      </Link>
      <Link href={`/admin/lucros${c}`} className="inicio-cartao">
        <span className="ic verde"><Banknote size={22} /></span>
        <div className="corpo"><strong>Lucros dos sócios</strong><span className="desc">Retiradas informadas × extrato do banco: o que o cliente esqueceu</span>
          <span className="num">{plural(r.retiradas, 'empresa enviou as retiradas', 'empresas enviaram as retiradas')}</span></div>
      </Link>
      <Link href="/admin/pendencias" className="inicio-cartao">
        <span className="ic roxo"><MessagesSquare size={22} /></span>
        <div className="corpo"><strong>Pendências</strong><span className="desc">Pedidos aos clientes e as respostas deles</span>
          <span className="num">{r.pendencias ? <b className="alerta">{plural(r.pendencias, 'resposta nova', 'respostas novas')}</b> : 'Nenhuma resposta nova'} · {plural(r.pend_aguardando, 'aguardando cliente', 'aguardando clientes')}</span></div>
      </Link>
    </section>

    <h2 className="inicio-secao">Cadastros e ajustes</h2>
    <section className="inicio-pequenos">
      <Link href="/admin/empresas" className="inicio-mini"><Building2 size={18} /><span><strong>Empresas</strong><small>{plural(r.empresas, 'ativa', 'ativas')} · cadastrar nova</small></span></Link>
      <Link href="/admin/usuarios" className="inicio-mini"><KeyRound size={18} /><span><strong>Usuários</strong><small>{plural(r.usuarios, 'acesso ativo', 'acessos ativos')}</small></span></Link>
      <Link href="/admin/whatsapp" className="inicio-mini"><MessageCircle size={18} /><span><strong>WhatsApp (Digisac)</strong><small className={zap ? 'ok' : 'alerta'}>{zap ? 'Ligado' : 'Desligado: configurar'}{r.sem_whatsapp ? ` · ${r.sem_whatsapp} sem número` : ''}</small></span></Link>
      <Link href="/admin/relatorios" className="inicio-mini"><FileBarChart size={18} /><span><strong>Relatórios</strong><small>Visão geral e Excel</small></span></Link>
      <Link href="/admin/modelos" className="inicio-mini"><Layers size={18} /><span><strong>Modelos de documentos</strong><small>Listas prontas para aplicar</small></span></Link>
      <Link href="/admin/auditoria" className="inicio-mini"><ScrollText size={18} /><span><strong>Auditoria</strong><small>Quem fez o quê e quando</small></span></Link>
      <Link href="/admin/lgpd" className="inicio-mini"><ShieldCheck size={18} /><span><strong>LGPD</strong><small>Dados pessoais e retenção</small></span></Link>
      <Link href="/ajuda" className="inicio-mini"><CircleHelp size={18} /><span><strong>Ajuda</strong><small>Vídeos e passo a passo</small></span></Link>
    </section>
  </main></>);
}
