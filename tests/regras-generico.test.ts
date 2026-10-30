import { describe, expect, it } from 'vitest';
import { sugerirGenerico, servePara } from '../src/lib/regras-generico';
import { PLANO_GENERICO } from '../src/lib/plano-generico';

const nome = (d: string, v: number, cnpj?: string) => { const s = sugerirGenerico(d, v, cnpj); return s ? [PLANO_GENERICO.find((c) => c.codigo === s.codigo)!.nome, s.conf] : null; };
describe('sugestão de categoria (plano genérico)', () => {
  it('reconhece despesas comuns pela descrição do banco', () => {
    expect(nome('TARIFA SERV.COBR.TITULOS - DOC.: COB000003', -627)).toEqual(['Tarifas bancárias', 'A']);
    expect(nome('PGTO DAS SIMPLES NACIONAL', -150000)).toEqual(['DAS do Simples Nacional', 'A']);
    expect(nome('DEBITO CONVENIOS - CEEE EQUATORIAL', -32000)).toEqual(['Energia elétrica', 'M']);
    expect(nome('QR Code Pix enviado - Posto Tigrao', -1849)).toEqual(['Combustível', 'M']);
    expect(nome('PIX ENVIADO - UBER DO BRASIL TECNOLOGIA LTDA.', -2390)).toEqual(['Aplicativos de transporte', 'M']);
    expect(nome('PIX ENVIADO - CONTVOO CONTABILIDADE LTDA', -45000)).toEqual(['Honorários contábeis', 'M']);
    expect(nome('Cobrança Seguro Cartão Protegido - Para: PAGSEGURO INTERNET INSTITUICAO DE PAGAMENTO', -790)).toEqual(['Seguros', 'M']);
    expect(nome('APLICACAO AUTOMATICA CDB', -100000)).toEqual(['Aplicações financeiras', 'M']);
  });
  it('CNPJ da própria empresa na descrição = transferência entre contas dela', () => {
    expect(nome('PAGAMENTO PIX - ALLIANCE PVC / 51.149.501/0001-75', -700000, '51.149.501/0001-75')).toEqual(['Dinheiro enviado para outra conta da empresa', 'A']);
    expect(nome('RECEBIMENTO PIX - ALLIANCE INSTALAC / 51.149.501/0001-75', 500000, '51149501000175')).toEqual(['Transferência recebida de conta própria', 'A']);
  });
  it('nunca sugere categoria de saída para entrada (e vice-versa); desconhecido fica sem sugestão', () => {
    expect(nome('RECEBIMENTO PIX - MARIA SOUZA', 140000)).toEqual(['Recebimento de clientes', 'B']);
    expect(nome('PIX ENVIADO - Leandro de Moraes Rosa', -150000)).toBeNull();
    for (const d of ['TARIFA', 'POSTO', 'CEEE', 'UBER', 'SEGURO']) { const s = sugerirGenerico(d, 1000); if (s) expect(servePara(PLANO_GENERICO.find((c) => c.codigo === s.codigo)!.tipo, 'C')).toBe(true); }
  });
});
