import { createRequire } from 'node:module';
// Núcleo do Conciliador Contvoo (leitores de extrato, plano de contas e regras de classificação). Ver cabeçalho do .cjs.
export const { Core, Local } = createRequire(import.meta.url)('./conciliador-core.cjs') as { Core: any; Local: any };
