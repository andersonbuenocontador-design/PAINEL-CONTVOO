export class AppError extends Error {
  constructor(message: string, public code: 'validacao' | 'proibido' | 'nao_encontrado' | 'conflito' | 'auth' = 'validacao') {
    super(message);
  }
}
export type Actor = { id: string; papel: 'admin' | 'cliente' };

export function exigirAdmin(a: Actor) {
  if (a.papel !== 'admin') throw new AppError('Acesso restrito ao escritório.', 'proibido');
}
