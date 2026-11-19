/** Mensagem padrão do WhatsApp (Digisac) para a "Solicitação de documentos" do G-Click, para quem não tem e-mail. Sem banco (serve na tela também). */
export const SOLICITACAO_PADRAO = `Olá!

Solicito os documentos para contabilidade e registros fiscais, os extratos nas extensões: .OFX e PDF, referente à competência {competencia}.

*Para a realização da conciliação bancária:*
• Extrato das contas correntes e/ou outras contas bancárias;
• Extrato das aplicações e rendimentos de aplicações;
• Extrato das movimentações com cartão de crédito;
• Extrato da Cobrança bancária.

*Os principais documentos contábeis são:*
• Água;
• Luz;
• Aluguéis;
• Duplicatas pagas;
• Comprovantes de despesas/custos;
• Cópia do comprovante de pagamento de adiantamento, salários, férias, décimo terceiro e rescisões e recibo de pagamento de Autônomo (RPA);
• Cópia do comprovante de pagamento de Impostos;
• Informação ou Boletim de ocorrência de perda/roubo de material/máquinas/veículos, para emissão de NF se contribuinte do ICMS;
• Nota fiscal de compra e serviço tomado;
• Nota fiscal/Contrato de aquisição ou venda de material de uso permanente (é necessário identificar no documento que é imobilização);
• Nota fiscal/Recibos de despesas;
• Nota fiscal/Recibos de outros tipos de operações financeiras;
• Relação de controle de recebimento dos clientes (é necessário identificar no documento o nº da nota fiscal/recibo e o número da parcela);
• Relação de controle de pagamento de fornecedores (é necessário identificar no documento o nº da nota fiscal/recibo e o número da parcela);
• Telefone.

Nesta lista não estão esgotados todos os documentos, mas aqueles mais comuns. Convém lembrar de remeter a informação ou cópia de todo material relevante às informações contábeis e financeiras.

Qualquer comprovante ou documento que esteja em nome do empreendedor, pessoa física, não pode ser contabilizado ou entrar nas informações fiscais. Isso porque as contas de empresa e responsável são separadas, uma em CPF e outra em CNPJ, da mesma forma que os registros têm de ser feitos.

Qualquer dúvida, estamos à disposição.

Atenciosamente,
Contvoo Contabilidade`;
export const MARCADORES_SOLICITACAO = [
  { chave: '{nome}', explica: 'nome completo do contato (como está no Digisac/G-Click)' },
  { chave: '{empresa}', explica: 'nome da empresa (apelido no G-Click)' },
  { chave: '{competencia}', explica: 'competência abreviada (ex.: NOV/2026)' },
  { chave: '{mes}', explica: 'competência por extenso (ex.: novembro/2026)' },
  { chave: '{vencimento}', explica: 'vencimento da tarefa no G-Click (ex.: 10/12/2026)' },
  { chave: '{link}', explica: 'link do Painel do Cliente para enviar os documentos' },
] as const;
export const TAREFA_PADRAO = 'Solicitação de Documentos Contábeis';
export const TAMANHO_MAX_SOLICITACAO = 4000;
export type DadosSolicitacao = { nome: string; empresa: string; mes: string; competencia?: string; vencimento: string; link: string | null };
const ABREV = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
/** "2026-09" → "SET/2026". */
export const competenciaAbreviada = (c: string) => `${ABREV[Number(c.slice(5, 7)) - 1]}/${c.slice(0, 4)}`;

export function montarSolicitacao(modelo: string, d: DadosSolicitacao) {
  const nome = d.nome.trim();
  let t = modelo || SOLICITACAO_PADRAO;
  if (!nome) t = t.replace(/,\s*\{nome\}/g, '').replace(/\{nome\}\s*/g, '');
  return t.replace(/\{nome\}/g, nome).replace(/\{empresa\}/g, d.empresa).replace(/\{competencia\}/g, d.competencia ?? '').replace(/\{mes\}/g, d.mes).replace(/\{vencimento\}/g, d.vencimento)
    .replace(/\{link\}/g, d.link ?? 'o Painel do Cliente').replace(/\n{3,}/g, '\n\n').trim();
}
export const EXEMPLO_SOLICITACAO: DadosSolicitacao = { nome: 'Joana Ribeiro Prado', empresa: 'Padaria Exemplo', mes: 'novembro/2026', competencia: 'NOV/2026', vencimento: '10/12/2026', link: 'https://painel-contvoo.onrender.com' };
