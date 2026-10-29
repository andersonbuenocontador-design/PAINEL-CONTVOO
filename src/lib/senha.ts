/** Política de senha: tamanho, lista de senhas óbvias, repetição/sequência e semelhança com o e-mail. Devolve a mensagem do problema, ou null se estiver ok. */
const OBVIAS = new Set(['1234567890', '12345678901', '123456789012', 'senha12345', 'senha123456', 'password123', 'password1234', 'qwertyuiop', 'qwerty12345', 'abcdefghij', 'abc1234567', 'admin12345', 'admin123456', 'mudar12345', 'trocar12345', 'contvoo123', 'contvoo2026', 'painel12345', '0123456789', '1q2w3e4r5t', 'iloveyou123']);
const SO_PALAVRA = new Set(['senha', 'password', 'admin', 'qwerty', 'contvoo', 'painel', 'contabil', 'contabilidade', 'mudar', 'trocar']);
export function problemaDaSenha(senha: string, email?: string): string | null {
  if (senha.length < 10) return 'A senha deve ter pelo menos 10 caracteres.';
  if (senha.length > 128) return 'A senha é longa demais (máx. 128 caracteres).';
  // Opção do dono do sistema: SENHA_POLITICA_BRANDA=1 aceita qualquer senha com 10+ caracteres (sem checar palavras comuns/sequências/e-mail).
  if (process.env.SENHA_POLITICA_BRANDA === '1') return null;
  const s = senha.toLowerCase();
  if (OBVIAS.has(s)) return 'Essa senha é muito comum. Escolha outra.';
  if (/^(.)\1+$/.test(s)) return 'A senha não pode ser um único caractere repetido.';
  if (/^(0123456789|1234567890|abcdefghij|9876543210)/.test(s) && new Set(s).size <= 10) return 'A senha não pode ser uma sequência óbvia.';
  const letras = s.replace(/[^a-z]/g, '');
  if (SO_PALAVRA.has(letras)) return 'A senha é fácil de adivinhar (palavra comum + números). Escolha outra.';
  const local = (email ?? '').split('@')[0].toLowerCase();
  if (local.length >= 4 && s.includes(local)) return 'A senha não pode conter o seu e-mail.';
  return null;
}
