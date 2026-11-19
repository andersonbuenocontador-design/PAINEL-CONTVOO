import { FileSignature, FileText, Landmark, Receipt, Scale, Users } from 'lucide-react';
import { bancoDe, tipoDocumento } from '@/lib/bancos';

const TIPO = {
  extrato: { cor: '#1f5eff', fundo: '#eef2ff', icone: <Landmark size={20} /> },
  folha: { cor: '#6941c6', fundo: '#f4f0ff', icone: <Users size={20} /> },
  nota: { cor: '#0e9384', fundo: '#e6f6f4', icone: <Receipt size={20} /> },
  guia: { cor: '#b54708', fundo: '#fff4e5', icone: <Scale size={20} /> },
  contrato: { cor: '#344054', fundo: '#f2f4f7', icone: <FileSignature size={20} /> },
  outro: { cor: '#475467', fundo: '#f2f4f7', icone: <FileText size={20} /> },
} as const;

/** Selo do documento: banco nas cores da marca (sigla) ou ícone pelo tipo (folha, nota, guia…). */
export function MarcaDoc({ nome, instituicao, categoria, tamanho = 44 }: { nome: string; instituicao?: string | null; categoria?: string | null; tamanho?: number }) {
  const b = bancoDe(instituicao, nome);
  if (b) return (<span className="marca-doc" style={{ width: tamanho, height: tamanho, background: b.fundo, color: b.texto, fontSize: b.sigla.length > 2 ? tamanho * 0.3 : tamanho * 0.4 }} title={b.nome} aria-label={b.nome}>{b.sigla}</span>);
  const t = TIPO[tipoDocumento(nome, categoria)];
  return <span className="marca-doc" style={{ width: tamanho, height: tamanho, background: t.fundo, color: t.cor }} aria-hidden="true">{t.icone}</span>;
}
