/** Mascote da CONTVOO AI (o mesmo do Contvoo Gestão): robozinho de camisa polo preta com o logo oficial da CONTVOO no peito. */
export function RoboContvoo({ size = 48, className, id = 'rc' }: { size?: number; className?: string; id?: string }) {
  const g = (n: string) => `${id}-${n}`;
  return (
    <svg viewBox="0 0 120 132" width={size} height={size * 1.1} className={className} role="img" aria-label="CONTVOO AI">
      <defs>
        <linearGradient id={g('metal')} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f4f7fb" /><stop offset="1" stopColor="#c9d3df" /></linearGradient>
        <linearGradient id={g('visor')} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0b2a4a" /><stop offset="1" stopColor="#081320" /></linearGradient>
        <linearGradient id={g('polo')} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1c1f24" /><stop offset="1" stopColor="#0a0b0d" /></linearGradient>
      </defs>
      {/* antena */}
      <line x1="60" y1="6" x2="60" y2="18" stroke="#9aa8b8" strokeWidth="3" strokeLinecap="round" />
      <circle cx="60" cy="6" r="4.5" fill="#1f8fe0"><animate attributeName="opacity" values="1;0.45;1" dur="2.4s" repeatCount="indefinite" /></circle>
      {/* orelhas */}
      <rect x="17" y="34" width="9" height="18" rx="4" fill="#9aa8b8" />
      <rect x="94" y="34" width="9" height="18" rx="4" fill="#9aa8b8" />
      {/* cabeça */}
      <rect x="24" y="17" width="72" height="52" rx="18" fill={`url(#${g('metal')})`} stroke="#b3c0cf" strokeWidth="1.5" />
      <rect x="32" y="27" width="56" height="32" rx="12" fill={`url(#${g('visor')})`} />
      {/* olhos e sorriso */}
      <g fill="#33c3ff">
        <ellipse cx="47" cy="40" rx="5" ry="6"><animate attributeName="ry" values="6;6;0.8;6;6" keyTimes="0;0.9;0.94;0.98;1" dur="4s" repeatCount="indefinite" /></ellipse>
        <ellipse cx="73" cy="40" rx="5" ry="6"><animate attributeName="ry" values="6;6;0.8;6;6" keyTimes="0;0.9;0.94;0.98;1" dur="4s" repeatCount="indefinite" /></ellipse>
      </g>
      <path d="M51 50 Q60 56 69 50" fill="none" stroke="#33c3ff" strokeWidth="2.6" strokeLinecap="round" />
      {/* pescoço */}
      <rect x="52" y="68" width="16" height="8" rx="2" fill="#9aa8b8" />
      {/* braços (metal) saindo das mangas */}
      <rect x="11" y="92" width="11" height="26" rx="5.5" fill={`url(#${g('metal')})`} stroke="#b3c0cf" />
      <rect x="98" y="92" width="11" height="26" rx="5.5" fill={`url(#${g('metal')})`} stroke="#b3c0cf" />
      {/* camisa polo preta: corpo + mangas curtas */}
      <path d="M38 76 L52 74 L60 82 L68 74 L82 76 L104 88 L100 100 L90 97 L90 128 Q60 132 30 128 L30 97 L20 100 L16 88 Z" fill={`url(#${g('polo')})`} stroke="#000" strokeWidth="1" strokeLinejoin="round" />
      {/* barra das mangas */}
      <path d="M16 88 L20 100" stroke="#3a3f47" strokeWidth="2" />
      <path d="M104 88 L100 100" stroke="#3a3f47" strokeWidth="2" />
      {/* gola polo */}
      <path d="M52 74 L60 82 L54 89 L47 77 Z" fill="#23272e" stroke="#000" strokeWidth="0.8" />
      <path d="M68 74 L60 82 L66 89 L73 77 Z" fill="#23272e" stroke="#000" strokeWidth="0.8" />
      {/* carcela com botões */}
      <path d="M60 82 L60 100" stroke="#3a3f47" strokeWidth="1.4" />
      <circle cx="60" cy="88" r="1.3" fill="#8c95a1" />
      <circle cx="60" cy="95" r="1.3" fill="#8c95a1" />
      {/* logo oficial no peito (lado esquerdo de quem veste) */}
      <image href="/logo-contvoo.png" x="67" y="89" width="18" height="17.6" preserveAspectRatio="xMidYMid meet" />
    </svg>
  );
}
