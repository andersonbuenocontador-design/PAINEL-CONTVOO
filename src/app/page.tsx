import { redirect } from 'next/navigation';
import { usuarioAtual } from '@/lib/session';
export default async function Home() {
  const u = await usuarioAtual();
  redirect(!u ? '/login' : u.papel === 'admin' ? '/admin' : '/cliente');
}
