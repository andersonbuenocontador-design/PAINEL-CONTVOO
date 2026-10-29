import { exigirUsuario } from '@/lib/session';
import { PendenciasPagina } from '../../../pendencias-view';
export default async function Page({ params, searchParams }: { params: Promise<{ empresaId: string }>; searchParams: Promise<{ erro?: string; ok?: string }> }) {
  const u = await exigirUsuario('cliente'); const { empresaId } = await params;
  return <PendenciasPagina u={u} empresaId={empresaId} sp={await searchParams} voltar={`/cliente/${empresaId}`} />;
}
