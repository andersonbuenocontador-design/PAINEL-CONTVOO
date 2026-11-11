'use client';
// "Outros documentos": escolhe um ou vários arquivos de qualquer tipo, vê a lista e envia (descrição opcional).
import { useRef, useState } from 'react';
import { acaoEnviarAvulsos } from './actions';

export function EnviarOutros({ empresaId, competencia }: { empresaId: string; competencia: string }) {
  const input = useRef<HTMLInputElement>(null); const [nomes, setNomes] = useState<string[]>([]); const [enviando, setEnviando] = useState(false);
  return (<form action={acaoEnviarAvulsos} className="d2-outros-form" onSubmit={() => setEnviando(true)}>
    <input type="hidden" name="empresaId" value={empresaId} /><input type="hidden" name="competencia" value={competencia} />
    <label className="d2-soltar">
      <input ref={input} type="file" name="arquivos" multiple required className="d2-oculto" aria-label="Escolher arquivos"
        onChange={(e) => setNomes([...(e.currentTarget.files ?? [])].map((f) => f.name))} />
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></svg>
      <span>{nomes.length ? <><strong>{nomes.length === 1 ? nomes[0] : `${nomes.length} arquivos escolhidos`}</strong> · trocar</> : <><strong>Escolher arquivos</strong> · PDF, foto, planilha, Word, XML…</>}</span>
    </label>
    {nomes.length > 0 && <div className="d2-outros-envio">
      <input name="descricao" maxLength={200} placeholder="Do que se trata? (opcional)" aria-label="Descrição" />
      <button disabled={enviando}>{enviando ? 'Enviando…' : nomes.length > 1 ? `Enviar ${nomes.length} arquivos` : 'Enviar arquivo'}</button>
    </div>}
  </form>);
}
