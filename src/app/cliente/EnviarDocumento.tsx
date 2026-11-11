'use client';
// Um botão só: toca, escolhe o arquivo e já envia (sem "Escolher arquivo / Nenhum arquivo escolhido").
import { useRef, useState } from 'react';
import { acaoEnviarArquivo } from './actions';

export function EnviarDocumento({ empresaId, competencia, exigenciaId, formatos, nome, texto, discreto }: {
  empresaId: string; competencia: string; exigenciaId: string; formatos: string[]; nome: string; texto: string; discreto?: boolean;
}) {
  const form = useRef<HTMLFormElement>(null); const [enviando, setEnviando] = useState(false);
  return (<form ref={form} action={acaoEnviarArquivo} className="d2-enviar">
    <input type="hidden" name="empresaId" value={empresaId} /><input type="hidden" name="competencia" value={competencia} /><input type="hidden" name="exigenciaId" value={exigenciaId} />
    <label className={`btn ${discreto ? 'd2-btn-leve' : ''} ${enviando ? 'd2-ocupado' : ''}`} title={`Aceita: ${formatos.join(', ').toUpperCase()}`}>
      <input type="file" name="arquivo" required accept={formatos.map((f) => '.' + f).join(',')} aria-label={`${texto}: ${nome}`} className="d2-oculto"
        onChange={(e) => { if (e.currentTarget.files?.length) { setEnviando(true); form.current?.requestSubmit(); } }} />
      {enviando ? 'Enviando…' : texto}
    </label>
  </form>);
}
