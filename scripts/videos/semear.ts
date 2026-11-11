// Dados FICTÍCIOS para gravar os vídeos do manual (empresas, pessoas, CNPJs e extrato inventados — nada de cliente real).
// Uso (num banco de teste recém-criado): npx tsx scripts/videos/semear.ts
process.loadEnvFile('.env.local');
import { mkdirSync, writeFileSync } from 'node:fs';
const { query } = await import('../../src/lib/db');
const { criarEmpresa } = await import('../../src/lib/services/empresas');
const { criarUsuario } = await import('../../src/lib/services/usuarios');
const { criarExigencia, enviarArquivo, enviarAvulsos, conferirArquivo } = await import('../../src/lib/services/documentos');
const { criarConta } = await import('../../src/lib/services/extratos');
const { criarPendencia } = await import('../../src/lib/services/pendencias');
const { criarSocio } = await import('../../src/lib/services/informes');

const OUT = process.env.DADOS_VIDEOS ?? '/tmp/videos-dados'; mkdirSync(OUT, { recursive: true });
const C = '2026-10';
const adm = { id: (await query("select id from usuarios where papel='admin' limit 1")).rows[0].id as string, papel: 'admin' as const };
const pdf = (t: string) => Buffer.from(`%PDF-1.4\n% ${t}\n`);

const A = await criarEmpresa(adm, { razaoSocial: 'Mercadinho Boa Compra Ltda', nomeFantasia: 'Boa Compra', cnpj: '11.222.333/0001-81' });
const B = await criarEmpresa(adm, { razaoSocial: 'Auto Peças Modelo Ltda', nomeFantasia: 'Auto Peças Modelo', cnpj: '45.723.174/0001-10' });
const ua = { id: await criarUsuario(adm, { nome: 'Maria Exemplo', email: 'maria@exemplo.com', papel: 'cliente', senhaTemporaria: 'Provisoria#Sol2026', empresaIds: [A] }), papel: 'cliente' as const };
const ub = { id: await criarUsuario(adm, { nome: 'João Exemplo', email: 'joao@exemplo.com', papel: 'cliente', senhaTemporaria: 'Provisoria#Lua2026', empresaIds: [B] }), papel: 'cliente' as const };
await criarConta(adm, A, { banco: 'Banco Exemplo', agencia: '0001', conta: '12345-6' });
const exA = await criarExigencia(adm, A, { nome: 'Extrato conta corrente', instituicao: 'Banco Exemplo', formatos: ['pdf', 'ofx'] });
await criarExigencia(adm, A, { nome: 'Notas fiscais de compra', formatos: ['pdf'] });
const exB1 = await criarExigencia(adm, B, { nome: 'Extrato conta corrente', instituicao: 'Banco Exemplo', formatos: ['pdf'] });
await criarExigencia(adm, B, { nome: 'Notas fiscais de compra', formatos: ['pdf'] });
// B já entregou o extrato (aprovado) mas falta a nota fiscal; mandou também um PDF em "Outros documentos"
const arq = await enviarArquivo(ub, { empresaId: B, exigenciaId: exB1, competencia: C, nome: 'extrato-outubro.pdf', dados: pdf('extrato ficticio') });
await conferirArquivo(adm, arq, 'aprovado');
await enviarAvulsos(ub, { empresaId: B, competencia: C, descricao: 'Contrato de aluguel', arquivos: [{ nome: 'contrato-aluguel.pdf', dados: pdf('contrato ficticio') }] });
await criarPendencia(adm, A, { categoria: 'documento', competencia: C, descricao: 'Envie o comprovante do pagamento do DAS de setembro.' } as never);
void exA;
// sócia da empresa A (CPF fictício válido), para a comparação de lucros com o extrato
await criarSocio(adm, A, { nome: 'Maria Exemplo', cpf: '529.712.440-91' } as never);

// Extrato OFX fictício de outubro/2026 (saldo anterior R$ 18.450,00)
const L: [number, number, string][] = [
  [1, 1850, 'RECEBIMENTO PIX - PADARIA ESTRELA LTDA / 12.345.678/0001-95'],
  [1, -420, 'PAGAMENTO PIX - DISTRIBUIDORA SOL NASCENTE LTDA / 98.765.432/0001-10'],
  [2, -89.9, 'DEBITO CONVENIOS - VIVO TELEFONE E INTERNET'],
  [3, 2300, 'RECEBIMENTO PIX - JOAO CARLOS PEREIRA / 123.456.789-09'],
  [3, -312.45, 'PAGAMENTO PIX - POSTO BELA VISTA COMBUSTIVEIS / 33.444.555/0001-66'],
  [4, -158.37, 'PAGAMENTO CONTA DE ENERGIA CEEE'],
  [5, 640, 'RECEBIMENTO PIX - ANA PAULA RODRIGUES / 987.654.321-00'],
  [6, -1500, 'PAGAMENTO PIX - IMOBILIARIA CENTRO LTDA ALUGUEL / 22.333.444/0001-55'],
  [7, -35.9, 'TARIFA PACOTE DE SERVICOS'],
  [8, 980, 'RECEBIMENTO PIX - LUCIANA MARTINS COSTA / 111.222.333-96'],
  [9, -2750, 'PAGAMENTO PIX - DISTRIBUIDORA SOL NASCENTE LTDA / 98.765.432/0001-10'],
  [10, 1200, 'RECEBIMENTO PIX - PADARIA ESTRELA LTDA / 12.345.678/0001-95'],
  [11, -812.3, 'PAGAMENTO DAS SIMPLES NACIONAL'],
  [12, -64.2, 'PAGAMENTO PIX - FULANO DE TAL SERVICOS / 123.123.123-12'],
  [13, 450, 'RECEBIMENTO PIX - PEDRO HENRIQUE ALVES / 321.654.987-11'],
  [14, -1980, 'PAGAMENTO PIX - DISTRIBUIDORA SOL NASCENTE LTDA / 98.765.432/0001-10'],
  [15, 3100, 'RECEBIMENTO PIX - JOAO CARLOS PEREIRA / 123.456.789-09'],
  [15, -5000, 'PIX ENVIADO - MARIA EXEMPLO / ***.712.440-**'],  // retirada que a cliente informa (vídeo c5)
  [16, -12.34, 'IOF OPERACAO DE CREDITO'],
  [17, -275, 'PAGAMENTO PIX - EMBALAGENS SANTA CRUZ LTDA / 44.555.666/0001-77'],
  [18, 820, 'RECEBIMENTO PIX - MARCIA REGINA TEIXEIRA / 741.852.963-00'],
  [19, -198.9, 'PAGAMENTO PIX - POSTO BELA VISTA COMBUSTIVEIS / 33.444.555/0001-66'],
  [20, 1560, 'RECEBIMENTO PIX - PADARIA ESTRELA LTDA / 12.345.678/0001-95'],
  [21, -2300, 'PAGAMENTO PIX - DISTRIBUIDORA SOL NASCENTE LTDA / 98.765.432/0001-10'],
  [22, -430, 'PAGAMENTO PIX - EMBALAGENS SANTA CRUZ LTDA / 44.555.666/0001-77'],
  [22, -1500, 'PIX ENVIADO - MARIA EXEMPLO / ***.712.440-**'],  // retirada esquecida (vídeo a6)
  [23, 275, 'RECEBIMENTO PIX - CARLOS EDUARDO MENDES / 159.357.486-22'],
  [24, -3200, 'PAGAMENTO PIX - FUNCIONARIA SALARIO ROSA LIMA / 258.147.369-33'],
  [25, 1740, 'RECEBIMENTO PIX - LUCIANA MARTINS COSTA / 111.222.333-96'],
  [26, -99.9, 'PAGAMENTO PIX - SISTEMAS ONLINE SOFTWARE LTDA / 55.666.777/0001-88'],
  [27, 2100, 'RECEBIMENTO PIX - JOAO CARLOS PEREIRA / 123.456.789-09'],
  [28, -640, 'PAGAMENTO PIX - FULANO DE TAL SERVICOS / 123.123.123-12'],
  [29, 390, 'RECEBIMENTO PIX - ANA PAULA RODRIGUES / 987.654.321-00'],
  [30, -1420.5, 'PAGAMENTO PIX - DISTRIBUIDORA SOL NASCENTE LTDA / 98.765.432/0001-10'],
];
const abertura = 18450; const saldoFinal = Math.round((abertura + L.reduce((s, x) => s + x[1], 0)) * 100) / 100;
const dt = (d: number) => `202610${String(d).padStart(2, '0')}090000`;
writeFileSync(`${OUT}/extrato-outubro.ofx`, `OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:UTF-8
CHARSET:1252
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE

<OFX>
<SIGNONMSGSRSV1><SONRS><STATUS><CODE>0<SEVERITY>INFO</STATUS><DTSERVER>20261101080000[-3:BRT]<LANGUAGE>POR</SONRS></SIGNONMSGSRSV1>
<BANKMSGSRSV1><STMTTRNRS><TRNUID>1<STATUS><CODE>0<SEVERITY>INFO</STATUS><STMTRS><CURDEF>BRL
<BANKACCTFROM><BANKID>Banco Exemplo<BANKID><BRANCHID>0001<ACCTID>12345-6<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST><DTSTART>20261001000000<DTEND>20261031235959
${L.map(([d, v, n], i) => `<STMTTRN><TRNTYPE>${v > 0 ? 'CREDIT' : 'DEBIT'}<DTPOSTED>${dt(d)}<TRNAMT>${v.toFixed(2)}<FITID>DEMO${String(i + 1).padStart(3, '0')}<NAME>${n}</STMTTRN>`).join('\n')}
</BANKTRANLIST><LEDGERBAL><BALAMT>${saldoFinal.toFixed(2)}<DTASOF>20261031235959</LEDGERBAL></STMTRS></STMTTRNRS></BANKMSGSRSV1>
</OFX>
`);
writeFileSync(`${OUT}/nota-fiscal.pdf`, pdf('nota fiscal ficticia'));
writeFileSync(`${OUT}/comprovante.pdf`, pdf('comprovante ficticio'));
writeFileSync(`${OUT}/ids.json`, JSON.stringify({ A, B, saldoAbertura: abertura, saldoFinal }));
console.log('semeado', { A, B, saldoFinal });
process.exit(0);
