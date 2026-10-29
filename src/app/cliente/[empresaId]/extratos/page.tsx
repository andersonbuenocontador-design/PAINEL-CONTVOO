import { exigirUsuario } from '@/lib/session';
import { competenciaDe } from '../../../components';
import { ExtratosPagina } from '../../../extratos-view';

export default async function Page({ params, searchParams }: { params: Promise<{ empresaId: string }>; searchParams: Promise<{ competencia?: string; erro?: string; ok?: string; pendentes?: string }> }) {
  const u = await exigirUsuario('cliente'); const { empresaId } = await params; const sp = await searchParams;
  return <ExtratosPagina u={u} empresaId={empresaId} comp={competenciaDe(sp.competencia)} sp={sp} base={`/cliente/${empresaId}/extratos`} voltar={`/cliente/${empresaId}`} />;
}
