import { redirect } from 'next/navigation';

/** Painel de auditoria retirado da tela por decisão do escritório. O registro continua sendo gravado no banco (imutável)
 *  e entra no backup; serve para investigar incidentes e atender a LGPD. A página volta para o início. */
export default function Auditoria() { redirect('/admin'); }
