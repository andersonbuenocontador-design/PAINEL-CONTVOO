const PREFIXOS = /^(PAGAMENTO|PAGTO|PAG|PIX|TED|DOC|TRANSF\w*|TRANSFERENCIA|RECEBIMENTO|RECEBIDO|ENVIADO|ENVIADA|RECEBIDA|BOLETO|COMPRA|DEBITO|CREDITO|CARTAO|TARIFA|\s|-|\/)+/;

/** Sugestão de nome e CPF/CNPJ a partir da descrição do banco (ex.: "PAGAMENTO PIX - BORRACHARIA TRES PO / 05.966.876/0001-00"). */
export function sugerirParticipante(descricao: string) {
  const doc = (descricao.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}|\d{3}\.\d{3}\.\d{3}-\d{2}/)?.[0] ?? '').replace(/\D/g, '');
  const partes = descricao.split(/\s+-\s+/);
  let nome = (partes.length > 1 ? partes.slice(1).join(' - ') : descricao).split(/\s+\/\s+|(?:^|\s+)DOC\.?:/i)[0];
  nome = nome.replace(PREFIXOS, '').replace(/\s+/g, ' ').trim();
  return { nome: nome.length >= 2 ? nome.slice(0, 120) : '', documento: doc.length === 11 || doc.length === 14 ? doc : '' };
}
/** Complemento do lançamento (planilha e tabela): nome do cliente/fornecedor + número da nota; sem nota, só o nome.
 *  Sem cliente/fornecedor cadastrado, usa o nome que aparece na descrição do banco (PIX/TED: "... - NOME / CNPJ"). */
export function complementoDe(l: { participante_nome?: string | null; nota_fiscal?: string | null; descricao_original?: string | null }) {
  const doBanco = l.descricao_original && /\s-\s/.test(l.descricao_original) ? sugerirParticipante(l.descricao_original).nome : '';
  const nome = l.participante_nome?.trim() || doBanco; const nf = l.nota_fiscal?.trim();
  if (nome && nf) return `${nome} NF ${nf}`;
  return nome || (nf ? `NF ${nf}` : '');
}
