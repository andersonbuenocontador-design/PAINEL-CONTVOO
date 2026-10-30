'use client';
// Para o cliente, a conciliação abre no modo guiado (um lançamento por vez); "Ver em tabela" mostra a tabela completa.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ConciliacaoGuiada } from './ConciliacaoGuiada';
import { ConciliacaoTabela, type ContaPlano, type Linha } from './ConciliacaoTabela';

export function ConciliacaoCliente(p: { linhas: Linha[]; plano: ContaPlano[]; bancos: { id: string; nome: string }[]; somenteLeitura: boolean; bancoInicial?: string; mes: string; enviar?: React.ReactNode; podeEnviar: boolean }) {
  const guiadaPossivel = !p.somenteLeitura && p.linhas.length > 0;
  const router = useRouter();
  const [modo, setModo] = useState<'guiada' | 'tabela'>('guiada');
  useEffect(() => { try { const m = localStorage.getItem('conciliacao-modo'); if (m === 'tabela') setModo('tabela'); } catch { /* sem armazenamento local */ } }, []);
  // ao trocar de modo, recarrega os dados do servidor (o modo guiado salva cada resposta na hora)
  const troca = (m: 'guiada' | 'tabela') => { setModo(m); try { localStorage.setItem('conciliacao-modo', m); } catch { /* ignora */ } router.refresh(); };
  if (guiadaPossivel && modo === 'guiada')
    return <ConciliacaoGuiada linhas={p.linhas} plano={p.plano} mes={p.mes} onVerTabela={() => troca('tabela')} onEnviar={p.enviar} podeEnviar={p.podeEnviar} primeiroBanco={p.bancoInicial} />;
  return (<>
    {guiadaPossivel && <div className="linha-flex" style={{ justifyContent: 'flex-end' }}><button className="btn pri" onClick={() => troca('guiada')}>✨ Classificar um por vez (modo guiado)</button></div>}
    <ConciliacaoTabela linhas={p.linhas} plano={p.plano} bancos={p.bancos} admin={false} somenteLeitura={p.somenteLeitura} bancoInicial={p.bancoInicial} />
  </>);
}
