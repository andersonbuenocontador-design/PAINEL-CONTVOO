/** Complemento do lançamento (planilha e tabela): nome do cliente/fornecedor + número da nota; sem nota, só o nome. */
export function complementoDe(l: { participante_nome?: string | null; nota_fiscal?: string | null }) {
  const nome = l.participante_nome?.trim(); const nf = l.nota_fiscal?.trim();
  if (nome && nf) return `${nome} NF ${nf}`;
  return nome || (nf ? `NF ${nf}` : '');
}
