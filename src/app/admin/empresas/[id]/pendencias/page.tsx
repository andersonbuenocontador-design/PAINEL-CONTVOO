import { exigirUsuario } from '@/lib/session';
import { PendenciasPagina } from '../../../../pendencias-view';
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ erro?: string; ok?: string }> }) {
  const u = await exigirUsuario('admin'); const { id } = await params;
  return <PendenciasPagina u={u} empresaId={id} sp={await searchParams} voltar={`/admin/empresas/${id}`} />;
}
