/** Identidade visual dos bancos (cores da marca + sigla) para os documentos pedidos. Sem imagens: só cor e texto. */
export type Marca = { chave: string; nome: string; sigla: string; fundo: string; texto: string };
export const BANCOS: (Marca & { re: RegExp })[] = [
  { chave: 'nubank', nome: 'Nubank', sigla: 'nu', fundo: '#820AD1', texto: '#fff', re: /\bnu ?bank\b|\bnu pagamentos\b/i },
  { chave: 'itau', nome: 'Itaú', sigla: 'itaú', fundo: '#EC7000', texto: '#fff', re: /\bita[uú]\b/i },
  { chave: 'bradesco', nome: 'Bradesco', sigla: 'B', fundo: '#CC092F', texto: '#fff', re: /bradesco/i },
  { chave: 'santander', nome: 'Santander', sigla: 'S', fundo: '#EC0000', texto: '#fff', re: /santander/i },
  { chave: 'bb', nome: 'Banco do Brasil', sigla: 'BB', fundo: '#FCD116', texto: '#0038A8', re: /banco do brasil|\bbb\b/i },
  { chave: 'caixa', nome: 'Caixa', sigla: 'CX', fundo: '#005CA9', texto: '#fff', re: /\bcaixa\b|\bcef\b/i },
  { chave: 'sicredi', nome: 'Sicredi', sigla: 'S', fundo: '#3FA110', texto: '#fff', re: /sicredi/i },
  { chave: 'sicoob', nome: 'Sicoob', sigla: 'S', fundo: '#003641', texto: '#7DB61C', re: /sicoob/i },
  { chave: 'inter', nome: 'Inter', sigla: 'in', fundo: '#FF7A00', texto: '#fff', re: /\binter\b/i },
  { chave: 'c6', nome: 'C6 Bank', sigla: 'C6', fundo: '#242424', texto: '#fff', re: /\bc6\b/i },
  { chave: 'banrisul', nome: 'Banrisul', sigla: 'B', fundo: '#004B9B', texto: '#fff', re: /banrisul/i },
  { chave: 'mercadopago', nome: 'Mercado Pago', sigla: 'MP', fundo: '#00B1EA', texto: '#fff', re: /mercado ?pago/i },
  { chave: 'pagbank', nome: 'PagBank', sigla: 'PB', fundo: '#00A859', texto: '#fff', re: /pag ?bank|pag ?seguro/i },
  { chave: 'stone', nome: 'Stone', sigla: 'S', fundo: '#00A868', texto: '#fff', re: /\bstone\b/i },
  { chave: 'btg', nome: 'BTG Pactual', sigla: 'BTG', fundo: '#0D2C54', texto: '#fff', re: /\bbtg\b/i },
  { chave: 'cora', nome: 'Cora', sigla: 'co', fundo: '#FE3E6D', texto: '#fff', re: /\bcora\b/i },
  { chave: 'original', nome: 'Original', sigla: 'O', fundo: '#00A857', texto: '#fff', re: /banco original|\boriginal\b/i },
  { chave: 'safra', nome: 'Safra', sigla: 'S', fundo: '#001E50', texto: '#C8A75E', re: /safra/i },
  { chave: 'unicred', nome: 'Unicred', sigla: 'U', fundo: '#00553B', texto: '#fff', re: /unicred/i },
  { chave: 'cresol', nome: 'Cresol', sigla: 'C', fundo: '#0D7A3E', texto: '#fff', re: /cresol/i },
  { chave: 'asaas', nome: 'Asaas', sigla: 'A', fundo: '#0030B9', texto: '#fff', re: /asaas/i },
  { chave: 'picpay', nome: 'PicPay', sigla: 'PP', fundo: '#11C76F', texto: '#fff', re: /pic ?pay/i },
  { chave: 'xp', nome: 'XP', sigla: 'XP', fundo: '#000', texto: '#FDD100', re: /\bxp\b/i },
  { chave: 'neon', nome: 'Neon', sigla: 'N', fundo: '#00E5FF', texto: '#0B1F33', re: /\bneon\b/i },
];
/** Banco citado no nome ou na instituição do documento (ex.: "Extrato — NUBANK"). */
export function bancoDe(...textos: (string | null | undefined)[]) {
  const t = textos.filter(Boolean).join(' ');
  return BANCOS.find((b) => b.re.test(t)) ?? null;
}
export type Tipo = 'extrato' | 'folha' | 'nota' | 'guia' | 'contrato' | 'outro';
export function tipoDocumento(nome: string, categoria?: string | null): Tipo {
  const t = `${nome} ${categoria ?? ''}`.toLowerCase();
  if (/extrato|banco|conta corrente/.test(t)) return 'extrato';
  if (/folha|pr[oó]-?labore|sal[aá]rio|f[eé]rias/.test(t)) return 'folha';
  if (/nota|nf-?e|nfs|cupom/.test(t)) return 'nota';
  if (/\bdas\b|guia|darf|gps|fgts|imposto|tributo/.test(t)) return 'guia';
  if (/contrato|aditivo|altera[cç][aã]o/.test(t)) return 'contrato';
  return 'outro';
}
