import { notFound, redirect } from 'next/navigation';
import { exigirUsuario } from '@/lib/session';
import { obterEmpresa } from '@/lib/services/empresas';
import { AppError } from '@/lib/errors';

/** Atalho do formulário "Nova solicitação para…": leva à página de pendências da empresa escolhida, onde se cria a solicitação. */
export default async function NovaPendencia({ searchParams }: { searchParams: Promise<{ empresaId?: string }> }) {
  const u = await exigirUsuario('admin'); const { empresaId = '' } = await searchParams;
  try { await obterEmpresa(u, empresaId); } catch (x) { if (x instanceof AppError) notFound(); throw x; }
  redirect(`/admin/empresas/${empresaId}/pendencias#nova`);
}
