// Diagnóstico local/por banco: imprime o relatório como anotações do GitHub. Em produção use a rota /api/diagnostico (workflow "Diagnóstico").
import pg from 'pg';
import { configPg } from '../src/lib/db';
import { diagnosticar } from '../src/lib/diagnostico';
import { relatorioDiagnostico } from '../src/lib/diagnostico-producao';
const c = new pg.Client(configPg());
try { await c.connect(); } catch (e) { console.log(`::error title=Sem conexão com o banco::${diagnosticar(e, 'banco')}`); process.exit(1); }
try { for (const s of await relatorioDiagnostico(c)) console.log(`::notice title=${s.titulo}::${s.linhas.join('%0A').replace(/\r?\n/g, ' ')}`); } finally { await c.end(); }
