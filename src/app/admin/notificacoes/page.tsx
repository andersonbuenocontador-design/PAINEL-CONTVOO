import { redirect } from 'next/navigation';

/** Avisos por e-mail desligados por decisão do escritório (sem e-mail). A página volta para o início. */
export default function Notificacoes() { redirect('/admin'); }
