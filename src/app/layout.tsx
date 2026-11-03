import './globals.css';
import './tema-escuro.css';
export const metadata = { title: 'Contvoo — Painel do Cliente', icons: { icon: '/logo-contvoo.png' } };
// aplica o modo noite antes de desenhar a página (sem "piscar" claro ao abrir)
const TEMA = `try{if(localStorage.getItem('tema')==='escuro')document.documentElement.dataset.theme='dark'}catch(e){}`;
export default function Root({ children }: { children: React.ReactNode }) {
  return <html lang="pt-BR" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: TEMA }} /></head><body>{children}</body></html>;
}
