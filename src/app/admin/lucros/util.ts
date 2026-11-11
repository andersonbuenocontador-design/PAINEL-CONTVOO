export const brlCent = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const brl = (v: string | number) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const dataBR = (d: string) => d.split('-').reverse().join('/');
export const STATUS_LUCROS = {
  atencao: { txt: 'Atenção', cls: 'atencao' },
  aguardando_extrato: { txt: 'Aguardando extrato', cls: 'aguardando' },
  ok: { txt: 'Tudo confere', cls: 'ok' },
  sem_movimento: { txt: 'Sem movimento', cls: 'neutro' },
} as const;
