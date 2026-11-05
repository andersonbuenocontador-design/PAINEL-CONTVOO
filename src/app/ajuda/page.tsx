import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { exigirUsuario } from '@/lib/session';
import { AULAS, type Aula } from '@/lib/ajuda';
import { Topo } from '../components';

export const metadata = { title: 'Ajuda — Contvoo' };
const dur = (s?: number) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : '');

function Cartao({ a, d }: { a: Aula; d?: number }) {
  return (<article className="aula card" id={a.id}>
    <div className="aula-video">
      <video controls preload="metadata" poster={`/ajuda-videos/${a.id}.jpg`} playsInline aria-label={`Vídeo: ${a.titulo}`}><source src={`/ajuda-videos/${a.id}.mp4`} type="video/mp4" />Seu navegador não abre vídeos. Use o passo a passo ao lado.</video>
    </div>
    <div className="aula-texto">
      <h3>{a.titulo}{d ? <span className="aula-dur">{dur(d)}</span> : null}</h3><p className="soon">{a.resumo}</p>
      <ol>{a.passos.map((p) => <li key={p}>{p}</li>)}</ol>
      {a.dica && <p className="aula-dica"><strong>Dica:</strong> {a.dica}</p>}
    </div>
  </article>);
}

/** Manual em vídeo: o cliente vê as aulas dele; o escritório vê as suas e as do cliente. */
export default async function Ajuda() {
  const u = await exigirUsuario();
  let durs: Record<string, number> = {}; try { durs = JSON.parse(readFileSync(join(process.cwd(), 'public/ajuda-videos/duracoes.json'), 'utf8')); } catch { /* sem durações */ }
  const admin = u.papel === 'admin';
  const cliente = AULAS.filter((a) => a.publico === 'cliente'); const escritorio = AULAS.filter((a) => a.publico === 'escritorio');
  return (<><Topo u={u} /><main className="ajuda">
    <div className="saudacao"><div><h1>Ajuda: vídeos e passo a passo</h1><p className="empresa-sub">Aprenda cada função do painel em poucos minutos. Os exemplos usam dados fictícios.</p></div></div>
    <nav className="ajuda-indice card" aria-label="Aulas">
      {admin && <div><strong>Para o escritório</strong><ul>{escritorio.map((a) => <li key={a.id}><a href={`#${a.id}`}>{a.titulo}</a></li>)}</ul></div>}
      <div><strong>{admin ? 'Para os clientes' : 'Aulas'}</strong><ul>{cliente.map((a) => <li key={a.id}><a href={`#${a.id}`}>{a.titulo}</a></li>)}</ul></div>
    </nav>
    {admin && <><h2 className="ajuda-secao">Para o escritório</h2>{escritorio.map((a) => <Cartao key={a.id} a={a} d={durs[a.id]} />)}</>}
    <h2 className="ajuda-secao">{admin ? 'Para os clientes (o que eles veem)' : 'Aulas'}</h2>{cliente.map((a) => <Cartao key={a.id} a={a} d={durs[a.id]} />)}
    <p className="soon">Ficou com dúvida? Fale com o escritório pela aba Pendências ou pelos canais de atendimento da Contvoo.</p>
  </main></>);
}
