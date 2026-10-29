import { NextRequest, NextResponse } from 'next/server';

// Barreira leve: sem cookie, redireciona ao login. A validação real (assinatura, usuário ativo, permissões)
// é refeita no servidor em cada página e ação (src/lib/session.ts e services).
export function proxy(req: NextRequest) {
  if (!req.cookies.get('painel_sessao')) return NextResponse.redirect(new URL('/login', req.url));
  return NextResponse.next();
}
export const config = { matcher: ['/admin/:path*', '/cliente/:path*', '/trocar-senha'] };
