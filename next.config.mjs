/** @type {import('next').NextConfig} */
export default {
  poweredByHeader: false,
  serverExternalPackages: ['pg', 'pdfjs-dist'],
  experimental: { serverActions: { bodySizeLimit: '25mb' } },
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'same-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
      ...(process.env.NODE_ENV === 'production' ? [
        { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        // 'unsafe-inline' em script é exigido pelo Next para hidratar; o restante fecha origens externas (só Google Fonts liberado)
        { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
      ] : []),
    ]}];
  },
};
