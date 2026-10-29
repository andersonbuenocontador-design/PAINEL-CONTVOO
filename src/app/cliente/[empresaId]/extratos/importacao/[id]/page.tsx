import { exigirUsuario } from '@/lib/session';
import { PreviaPagina } from '../../../../../extratos-view';

export default async function Page({ params, searchParams }: { params: Promise<{ empresaId: string; id: string }>; searchParams: Promise<{ erro?: string }> }) {
  const u = await exigirUsuario('cliente'); const { empresaId, id } = await params;
  return <PreviaPagina u={u} empresaId={empresaId} id={id} sp={await searchParams} base={`/cliente/${empresaId}/extratos`} />;
}
