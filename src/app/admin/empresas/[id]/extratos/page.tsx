import { exigirUsuario } from '@/lib/session';
import { competenciaDe } from '../../../../components';
import { ExtratosPagina } from '../../../../extratos-view';

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ competencia?: string; erro?: string; ok?: string; pendentes?: string }> }) {
  const u = await exigirUsuario('admin'); const { id } = await params; const sp = await searchParams;
  return <ExtratosPagina u={u} empresaId={id} comp={competenciaDe(sp.competencia)} sp={sp} base={`/admin/empresas/${id}/extratos`} voltar={`/admin/empresas/${id}`} />;
}
