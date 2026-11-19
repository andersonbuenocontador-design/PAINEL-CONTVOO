/** Mensagem de cobrança pelo WhatsApp: texto do escritório com marcadores que o painel preenche em cada cliente. Sem banco (serve na tela também). */
export const MENSAGEM_PADRAO = `Olá, {nome}! Tudo bem? 😊

Aqui é da Contvoo Contabilidade. Para fecharmos {mes} da {empresa}, ainda falta:
{documentos}

É só enviar pelo painel: {link}

Obrigado!`;
export const MARCADORES = [
  { chave: '{nome}', explica: 'nome completo do contato (como está no Digisac/G-Click)' },
  { chave: '{empresa}', explica: 'nome da empresa' },
  { chave: '{mes}', explica: 'mês cobrado (ex.: outubro/2026)' },
  { chave: '{documentos}', explica: 'lista do que falta, com o motivo quando foi recusado' },
  { chave: '{link}', explica: 'link direto para o cliente enviar' },
] as const;
export const TAMANHO_MAX_MENSAGEM = 1500;
export type DadosMensagem = { nome: string; empresa: string; mes: string; documentos: string[]; link: string | null };

export function montarMensagem(modelo: string, d: DadosMensagem) {
  const nome = d.nome.trim();
  let t = modelo || MENSAGEM_PADRAO;
  // sem nome do contato: "Olá, {nome}!" vira "Olá!"
  if (!nome) t = t.replace(/,\s*\{nome\}/g, '').replace(/\{nome\}\s*/g, '');
  return t.replace(/\{nome\}/g, nome).replace(/\{empresa\}/g, d.empresa).replace(/\{mes\}/g, d.mes)
    .replace(/\{documentos\}/g, d.documentos.join('\n')).replace(/\{link\}/g, d.link ?? 'o Painel do Cliente, em "Documentos do mês"')
    .replace(/\n{3,}/g, '\n\n').trim();
}
export const EXEMPLO: DadosMensagem = { nome: 'Joana Ribeiro Prado', empresa: 'Padaria Exemplo', mes: 'outubro/2026', documentos: ['• Extrato Sicredi — precisa enviar de novo: mês errado', '• Folha de pagamento'], link: 'https://painel-contvoo.onrender.com/cliente/…/documentos?competencia=2026-10' };
