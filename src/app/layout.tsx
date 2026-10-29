import './globals.css';
export const metadata = { title: 'Contvoo — Painel do Cliente', icons: { icon: '/logo-contvoo.png' } };
export default function Root({ children }: { children: React.ReactNode }) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
