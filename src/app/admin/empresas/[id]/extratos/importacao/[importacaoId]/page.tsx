import { exigirUsuario } from '@/lib/session';
import { PreviaPagina } from '../../../../../../extratos-view';

export default async function Page({ params, searchParams }: { params: Promise<{ id: string; importacaoId: string }>; searchParams: Promise<{ erro?: string }> }) {
  const u = await exigirUsuario('admin'); const { id, importacaoId } = await params;
  return <PreviaPagina u={u} empresaId={id} id={importacaoId} sp={await searchParams} base={`/admin/empresas/${id}/extratos`} />;
}
