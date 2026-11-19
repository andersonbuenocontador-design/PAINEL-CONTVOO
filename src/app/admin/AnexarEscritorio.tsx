'use client';
// "Anexar pelo escritório": um botão só; escolhe o arquivo e já envia.
import { useRef, useState } from 'react';
import { Paperclip } from 'lucide-react';
import { acaoEnviarPeloEscritorio } from './docs-actions';

export function AnexarEscritorio({ empresaId, competencia, exigenciaId }: { empresaId: string; competencia: string; exigenciaId: string }) {
  const f = useRef<HTMLFormElement>(null); const [indo, setIndo] = useState(false);
  return (<form ref={f} action={acaoEnviarPeloEscritorio} className="doc2-anexar">
    <input type="hidden" name="empresaId" value={empresaId} /><input type="hidden" name="competencia" value={competencia} /><input type="hidden" name="exigenciaId" value={exigenciaId} />
    <label className={`doc2-btn leve${indo ? ' ocupado' : ''}`} title="O arquivo vira a nova versão deste documento">
      <input type="file" name="arquivo" required className="d2-oculto" onChange={(e) => { if (e.currentTarget.files?.length) { setIndo(true); f.current?.requestSubmit(); } }} />
      <Paperclip size={14} /> {indo ? 'Enviando…' : 'Anexar pelo escritório'}
    </label>
  </form>);
}
