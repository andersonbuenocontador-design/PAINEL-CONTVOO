/** Mensagem padrão do WhatsApp (Digisac) para a "Solicitação de documentos" do G-Click, para quem não tem e-mail. Sem banco (serve na tela também). */
export const SOLICITACAO_PADRAO = `Olá, {nome}! Tudo bem? 😊

Aqui é da Contvoo Contabilidade. Já pode nos enviar os documentos contábeis de {mes} da {empresa}: extratos bancários, notas fiscais, comprovantes e o que mais houver no mês.

O prazo é até {vencimento}. É só enviar pelo painel: {link}

Obrigado!`;
export const MARCADORES_SOLICITACAO = [
  { chave: '{nome}', explica: 'nome completo do contato (como está no Digisac/G-Click)' },
  { chave: '{empresa}', explica: 'nome da empresa (apelido no G-Click)' },
  { chave: '{mes}', explica: 'competência (ex.: novembro/2026)' },
  { chave: '{vencimento}', explica: 'vencimento da tarefa no G-Click (ex.: 10/12/2026)' },
  { chave: '{link}', explica: 'link do Painel do Cliente para enviar os documentos' },
] as const;
export const TAREFA_PADRAO = 'Solicitação de Documentos Contábeis';
export type DadosSolicitacao = { nome: string; empresa: string; mes: string; vencimento: string; link: string | null };

export function montarSolicitacao(modelo: string, d: DadosSolicitacao) {
  const nome = d.nome.trim();
  let t = modelo || SOLICITACAO_PADRAO;
  if (!nome) t = t.replace(/,\s*\{nome\}/g, '').replace(/\{nome\}\s*/g, '');
  return t.replace(/\{nome\}/g, nome).replace(/\{empresa\}/g, d.empresa).replace(/\{mes\}/g, d.mes).replace(/\{vencimento\}/g, d.vencimento)
    .replace(/\{link\}/g, d.link ?? 'o Painel do Cliente').replace(/\n{3,}/g, '\n\n').trim();
}
export const EXEMPLO_SOLICITACAO: DadosSolicitacao = { nome: 'Joana Ribeiro Prado', empresa: 'Padaria Exemplo', mes: 'novembro/2026', vencimento: '10/12/2026', link: 'https://painel-contvoo.onrender.com' };
