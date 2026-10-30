// Next.js chama onRequestError em todo erro do servidor (páginas, ações e rotas): fica registrado para diagnóstico.
export async function onRequestError(err: unknown, request: { path: string; method: string }, context: { routerKind: string; routePath: string; routeType: string }) {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { registrarErro } = await import('./lib/registro-erros');
  registrarErro(err, `${request.method} ${context.routePath ?? request.path} (${context.routeType})`);
}
