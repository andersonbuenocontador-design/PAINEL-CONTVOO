/** Identidade visual dos bancos para os documentos pedidos: logo (public/bancos/<chave>.png, do PDF "Logos de bancos brasileiros",
 *  fonte rzmt.github.io/logos-bancos-br) e, sem logo, a cor da marca com a sigla. */
export type Marca = { chave: string; nome: string; sigla: string; fundo: string; texto: string; logo?: string };
export const BANCOS: (Marca & { re: RegExp })[] = [
  { chave: 'nubank', nome: 'Nubank', sigla: 'nu', fundo: '#820AD1', texto: '#fff', re: /\bnu ?bank\b|\bnu pagamentos\b/i },
  { chave: 'itau', nome: 'Itaú', sigla: 'itaú', fundo: '#EC7000', texto: '#fff', re: /\bita[uú](?![a-z])/i },
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
  { chave: 'agibank', nome: 'Agibank', sigla: 'A', fundo: '#0047BB', texto: '#fff', re: /agibank/i },
  { chave: 'pan', nome: 'Banco Pan', sigla: 'P', fundo: '#00AFEF', texto: '#fff', re: /banco pan\b|\bpan\b/i },
  { chave: 'bmg', nome: 'BMG', sigla: 'BMG', fundo: '#FF6B00', texto: '#fff', re: /\bbmg\b/i },
  { chave: 'bv', nome: 'BV', sigla: 'BV', fundo: '#0033A0', texto: '#fff', re: /\bbv\b|votorantim/i },
  { chave: 'brb', nome: 'BRB', sigla: 'BRB', fundo: '#003C7E', texto: '#fff', re: /\bbrb\b/i },
  { chave: 'banestes', nome: 'Banestes', sigla: 'B', fundo: '#004A93', texto: '#fff', re: /banestes/i },
  { chave: 'banese', nome: 'Banese', sigla: 'B', fundo: '#00813E', texto: '#fff', re: /banese/i },
  { chave: 'daycoval', nome: 'Daycoval', sigla: 'D', fundo: '#002D72', texto: '#fff', re: /daycoval/i },
  { chave: 'digio', nome: 'Digio', sigla: 'D', fundo: '#0A1E3F', texto: '#fff', re: /digio/i },
  { chave: 'efi', nome: 'Efí', sigla: 'Efí', fundo: '#F37021', texto: '#fff', re: /\bef[ií](?![a-z])|gerencianet/i },
  { chave: 'getnet', nome: 'Getnet', sigla: 'G', fundo: '#EC0000', texto: '#fff', re: /getnet/i },
  { chave: 'infinitepay', nome: 'InfinitePay', sigla: 'IP', fundo: '#00D26A', texto: '#000', re: /infinite ?pay/i },
  { chave: 'iugu', nome: 'iugu', sigla: 'iu', fundo: '#1F2B5B', texto: '#fff', re: /\biugu\b/i },
  { chave: 'magalupay', nome: 'MagaluPay', sigla: 'MP', fundo: '#0086FF', texto: '#fff', re: /magalu ?pay/i },
  { chave: 'mercantil', nome: 'Mercantil', sigla: 'M', fundo: '#002E5D', texto: '#fff', re: /mercantil/i },
  { chave: 'sofisa', nome: 'Sofisa', sigla: 'S', fundo: '#00A0DF', texto: '#fff', re: /sofisa/i },
  { chave: 'sumup', nome: 'SumUp', sigla: 'SU', fundo: '#000', texto: '#fff', re: /sum ?up/i },
  { chave: 'tribanco', nome: 'Tribanco', sigla: 'T', fundo: '#00519E', texto: '#fff', re: /tribanco/i },
  { chave: 'bnb', nome: 'Banco do Nordeste', sigla: 'BNB', fundo: '#A6192E', texto: '#fff', re: /banco do nordeste|\bbnb\b/i },
  { chave: 'banpara', nome: 'Banpará', sigla: 'B', fundo: '#00529B', texto: '#fff', re: /banpar[aá]/i },
  { chave: 'basa', nome: 'Banco da Amazônia', sigla: 'BA', fundo: '#00843D', texto: '#fff', re: /banco da amaz[oô]nia|\bbasa\b/i },
  { chave: 'cielo', nome: 'Cielo', sigla: 'C', fundo: '#0081C6', texto: '#fff', re: /\bcielo\b/i },
  { chave: 'ifood', nome: 'iFood Pago', sigla: 'iF', fundo: '#EA1D2C', texto: '#fff', re: /ifood/i },
  { chave: 'citibank', nome: 'Citibank', sigla: 'citi', fundo: '#003B70', texto: '#fff', re: /citi ?bank|\bciti\b/i },
  { chave: 'hsbc', nome: 'HSBC', sigla: 'H', fundo: '#DB0011', texto: '#fff', re: /\bhsbc\b/i },
  { chave: 'ailos', nome: 'Ailos', sigla: 'A', fundo: '#00995D', texto: '#fff', re: /\bailos\b/i },
  { chave: 'rendimento', nome: 'Rendimento', sigla: 'R', fundo: '#004B8D', texto: '#fff', re: /banco rendimento|\brendimento\b/i },
  { chave: 'bs2', nome: 'BS2', sigla: 'BS2', fundo: '#1A1A1A', texto: '#fff', re: /\bbs2\b/i },
  { chave: 'contaazul', nome: 'Conta Azul', sigla: 'CA', fundo: '#0066FF', texto: '#fff', re: /conta ?azul/i },
  { chave: 'stark', nome: 'Stark Bank', sigla: 'SB', fundo: '#0F2E4F', texto: '#fff', re: /stark ?bank/i },
  { chave: 'bndes', nome: 'BNDES', sigla: 'BN', fundo: '#00813E', texto: '#fff', re: /\bbndes\b/i },
  { chave: 'semparar', nome: 'Sem Parar', sigla: 'SP', fundo: '#E4004B', texto: '#fff', re: /sem ?parar/i },
];
/** Bancos com logo em public/bancos (todos os da lista acima). */
for (const b of BANCOS) b.logo = `/bancos/${b.chave}.png`;

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
