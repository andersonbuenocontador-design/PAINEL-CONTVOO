'use client';
// Conciliação com o Contvoo AI (um lançamento por vez) ou em tabela. Cliente abre no Contvoo AI; escritório abre na tabela e chama o Contvoo AI quando quiser.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ConciliacaoGuiada } from './ConciliacaoGuiada';
import { ConciliacaoTabela, type ContaPlano, type Linha } from './ConciliacaoTabela';
import type { Participante } from './Participante';

export function ConciliacaoCliente(p: { empresaId: string; participantes: Participante[]; linhas: Linha[]; plano: ContaPlano[]; bancos: { id: string; nome: string }[]; somenteLeitura: boolean; bancoInicial?: string; mes: string; enviar?: React.ReactNode; podeEnviar: boolean; admin?: boolean; semGuiada?: boolean }) {
  const guiadaPossivel = !p.somenteLeitura && !p.semGuiada && p.linhas.length > 0;
  const router = useRouter();
  const chave = p.admin ? 'conciliacao-modo-escritorio' : 'conciliacao-modo';
  const [modo, setModo] = useState<'guiada' | 'tabela'>(p.admin ? 'tabela' : 'guiada');
  useEffect(() => { try { const m = localStorage.getItem(chave); if (m === 'tabela' || m === 'guiada') setModo(m); } catch { /* sem armazenamento local */ } }, [chave]);
  // ao trocar de modo, recarrega os dados do servidor (o modo guiado salva cada resposta na hora)
  const troca = (m: 'guiada' | 'tabela') => { setModo(m); try { localStorage.setItem(chave, m); } catch { /* ignora */ } router.refresh(); };
  if (guiadaPossivel && modo === 'guiada')
    return <ConciliacaoGuiada empresaId={p.empresaId} participantes={p.participantes} linhas={p.linhas} plano={p.plano} mes={p.mes} onVerTabela={() => troca('tabela')} onEnviar={p.enviar} podeEnviar={p.podeEnviar} primeiroBanco={p.bancoInicial} />;
  return (<>
    {guiadaPossivel && <div className="linha-flex" style={{ justifyContent: 'flex-end' }}><button className="btn pri" onClick={() => troca('guiada')}>Pedir ajuda ao Contvoo AI</button></div>}
    <ConciliacaoTabela empresaId={p.empresaId} participantes={p.participantes} linhas={p.linhas} plano={p.plano} bancos={p.bancos} admin={!!p.admin} somenteLeitura={p.somenteLeitura} bancoInicial={p.bancoInicial} />
  </>);
}
