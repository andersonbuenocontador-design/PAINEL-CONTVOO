import { redirect } from 'next/navigation';

/** Aba Modelos retirada do menu por decisão do escritório. A página volta para o início. */
export default function Modelos() { redirect('/admin'); }
