'use server';
import { exigirUsuario } from '@/lib/session';
import { executar } from '@/lib/actions-util';
import { desligarDigisac, enviarTesteDigisac, escolherConexao, salvarAcessoDigisac } from '@/lib/services/digisac';

const s = (fd: FormData, k: string) => String(fd.get(k) ?? '');
const V = '/admin/whatsapp';
export async function acaoSalvarDigisac(fd: FormData) { const u = await exigirUsuario('admin'); await executar(V, 'Acesso ao Digisac salvo. Agora escolha a conexão do WhatsApp.', () => salvarAcessoDigisac(u, { url: s(fd, 'url'), token: s(fd, 'token') })); }
export async function acaoEscolherConexao(fd: FormData) {
  const u = await exigirUsuario('admin'); const [id, ...nome] = s(fd, 'conexao').split('|');
  await executar(V, 'Conexão escolhida. Faça um envio de teste para o seu número.', () => escolherConexao(u, id, nome.join('|')));
}
export async function acaoTesteDigisac(fd: FormData) { const u = await exigirUsuario('admin'); await executar(V, 'Mensagem de teste enviada. Confira no WhatsApp.', () => enviarTesteDigisac(u, s(fd, 'numero'))); }
export async function acaoDesligarDigisac() { const u = await exigirUsuario('admin'); await executar(V, 'Integração com o Digisac desligada. O botão "Cobrar envio" volta a abrir o WhatsApp.', () => desligarDigisac(u)); }
