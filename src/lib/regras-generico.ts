// Regras de sugestão para o PLANO GENÉRICO de categorias (linguagem simples do cliente).
// Cada regra olha a descrição do banco (sem acentos, maiúscula) e o sentido (C entrada, D saída) e sugere uma categoria pela
// referência da planilha (REC001…). Confiança: A = inequívoco (tarifa, IOF, DAS…); M = provável (precisa só confirmar);
// B = palpite fraco (ex.: PIX recebido → recebimento de cliente). Nunca sugere categoria do sentido contrário.
import { PLANO_GENERICO } from './plano-generico';

type Regra = { re: RegExp; sentido: 'C' | 'D' | 'CD'; ref: string; conf: 'A' | 'M' | 'B'; motivo: string };
const R = (re: RegExp, sentido: Regra['sentido'], ref: string, conf: Regra['conf'], motivo: string): Regra => ({ re, sentido, ref, conf, motivo });

// a ordem importa: a primeira que servir vence
const REGRAS: Regra[] = [
  R(/\bIOF\b/, 'D', 'FIN006', 'A', 'IOF é encargo financeiro.'),
  R(/\bTARIFA|\bTAR\b|\bTAR\.|CESTA DE SERV|PACOTE (DE )?SERV|MENSALIDADE (SEGURO )?CONTA|ANUIDADE|MANUT(ENCAO)? (DE )?CONTA|TX\.? ?SERV/, 'D', 'FIN001', 'A', 'Tarifa cobrada pelo banco.'),
  R(/SIMPLES NAC|\bPGDAS|\bDAS\b|DOC(UMENTO)? DE ARRECADACAO DO SIMPLES/, 'D', 'IMP001', 'A', 'Guia do Simples Nacional.'),
  R(/\bFGTS\b|GRF\b|FGTS DIGITAL/, 'D', 'FOL009', 'A', 'Recolhimento de FGTS.'),
  R(/\bDARF\b|RECEITA FEDERAL|\bIRPJ\b|\bCSLL\b|\bPIS\b|\bCOFINS\b/, 'D', 'IMP002', 'M', 'Imposto federal.'),
  R(/\bGPS\b|\bINSS\b|DCTFWEB|PREVIDENCIA/, 'D', 'FOL008', 'M', 'INSS da folha (confira se não é do pró-labore).'),
  R(/\bICMS\b|SEFAZ|\bGNRE\b|DARE\b/, 'D', 'IMP003', 'M', 'Imposto estadual.'),
  R(/\bISSQN?\b|\bIPTU\b|PREFEITURA|PREF MUN|MUNICIPIO DE/, 'D', 'IMP004', 'M', 'Imposto ou taxa municipal.'),
  R(/JUNTA COMERCIAL|JUCERGS|DETRAN|CARTORIO|TAXA DE FISCALIZACAO|ALVARA/, 'D', 'IMP006', 'M', 'Taxa de órgão público.'),
  R(/CEEE|EQUATORIAL|\bRGE\b|CPFL|COPEL|CELESC|CEMIG|ENEL\b|\bLIGHT\b|ENERGISA|ELEKTRO|COELBA|ENERGIA ELETR|CERTEL|CERMISSOES|COOP(ERATIVA)? DE ENERGIA/, 'D', 'DES003', 'M', 'Conta de energia elétrica.'),
  R(/CORSAN|AEGEA|SANEAMENTO|\bDMAE\b|SABESP|SANEPAR|CASAN|COPASA|EMBASA|SEMAE|AGUAS? D|SERVICO DE AGUA/, 'D', 'DES002', 'M', 'Conta de água.'),
  R(/SEGURO|SEGURADORA|PORTO SEGURO|BRADESCO SEG|TOKIO MARINE|MAPFRE|HDI\b|LIBERTY|ALLIANZ|AZUL SEG/, 'D', 'DES012', 'M', 'Seguro.'),
  R(/\bVIVO\b|TELEFONICA|\bCLARO\b|\bTIM\b|\bOI S|\bOI\b|NET SERV|EMBRATEL|ALGAR|SKY\b|PROVEDOR|FIBRA|INTERNET|BRISANET|DESKTOP SA/, 'D', 'DES004', 'M', 'Telefone ou internet.'),
  R(/POSTO|COMBUST|ABASTEC|IPIRANGA|SHELL|PETROBRAS|\bBR MANIA|AUTO POSTO|REDE DE POSTOS|GASOLINA|DIESEL/, 'D', 'TRA001', 'M', 'Abastecimento de combustível.'),
  R(/PEDAGIO|SEM PARAR|CONECTCAR|VELOE|MOVE MAIS|ESTACIONAMENTO|ESTAPAR|ZONA AZUL/, 'D', 'TRA002', 'M', 'Pedágio ou estacionamento.'),
  R(/\bUBER\b|\b99 ?(APP|POP|TAXI|TECNOLOGIA)|CABIFY|TAXI\b/, 'D', 'TRA006', 'M', 'Transporte por aplicativo.'),
  R(/LAVAGEM|LAVAGEN|AUTO ?CENTER|PNEU|MECANICA|OFICINA|BORRACHARIA|AUTO PECAS|AUTOPECAS|TROCA DE OLEO|FUNILARIA/, 'D', 'TRA003', 'M', 'Manutenção de veículo.'),
  R(/CONTABIL|CONTABILIDADE|ESCRITORIO DE CONTAB/, 'D', 'DES009', 'M', 'Honorários do escritório de contabilidade.'),
  R(/ALUGUEL|IMOBILIARIA|LOCACAO DE IMOVEL|CONDOMINIO/, 'D', 'DES001', 'M', 'Aluguel do imóvel.'),
  R(/CONSORCIO/, 'D', 'FIN005', 'M', 'Parcela de consórcio (o escritório separa o que é bem e o que é taxa).'),
  R(/EMPRESTIMO|FINANCIAMENTO|\bCDC\b|PARC(ELA)? (DE )?EMPR|AMORTIZACAO|CAPITAL DE GIRO|PRONAMPE/, 'D', 'FIN004', 'M', 'Parcela de empréstimo (principal e juros são separados na revisão).'),
  R(/EMPRESTIMO|CREDITO PESSOAL|LIBERACAO DE CREDITO|CAPITAL DE GIRO|PRONAMPE/, 'C', 'REC005', 'M', 'Dinheiro de empréstimo recebido.'),
  R(/JUROS|ENCARGOS|MORA\b|CHEQUE ESPECIAL|LIS\b|LIMITE DA CONTA/, 'D', 'FIN006', 'M', 'Juros ou encargos financeiros.'),
  R(/TAXA (DE )?(ANTECIP|CARTAO|MAQUIN)|\bMDR\b|ALUGUEL (DA )?MAQUIN|TAXA ADMINISTR(ATIVA)? (DO )?CARTAO/, 'D', 'FIN002', 'M', 'Taxa de cartão ou maquininha.'),
  R(/RENDIMENTO|REND\.? ?(APLIC|POUP)|JUROS (DE )?APLIC|RENDE FACIL/, 'C', 'REC008', 'M', 'Rendimento de aplicação.'),
  R(/APLICACAO|APLIC\.? ?AUT|\bCDB\b|POUPANCA|INVEST(IMENTO)? AUTOM/, 'D', 'ATI006', 'M', 'Dinheiro aplicado.'),
  R(/ESTORNO|DEVOLUCAO|REEMBOLSO|CASHBACK/, 'C', 'REC009', 'M', 'Estorno ou reembolso.'),
  R(/VENDAS? .*(CREDITO|DEBITO|MASTERCARD|VISA|ELO)|ANTECIPACAO DE (RECEB|VENDAS)|STONE|CIELO|\bREDE\b|GETNET|SUMUP|PAGSEGURO.*VENDA|VENDAS - DISPONIVEL|RECEBIVEIS|LIQUIDACAO (DE )?CARTAO/, 'C', 'REC003', 'M', 'Recebimento de vendas no cartão.'),
  R(/SALARIO|FOLHA (DE )?PAG|PAGTO FUNC|PAGAMENTO DE FUNCIONARIO|PROVENTOS/, 'D', 'FOL001', 'M', 'Pagamento de salário.'),
  R(/PRO.?LABORE/, 'D', 'FOL010', 'M', 'Pró-labore dos sócios.'),
  R(/VALE.?TRANSP|\bVT\b|TRI\b|BEM ?CARD|PASSE/, 'D', 'FOL005', 'M', 'Vale-transporte.'),
  R(/VALE.?(ALIM|REFEI)|SODEXO|ALELO|TICKET|PLUXEE|\bVR BENEF|FLASH BENEF|CAJU BENEF/, 'D', 'FOL006', 'M', 'Vale-alimentação/refeição.'),
  R(/UNIMED|PLANO DE SAUDE|AMIL|HAPVIDA|BRADESCO SAUDE|SULAMERICA SAUDE|ODONTO/, 'D', 'FOL007', 'M', 'Plano de saúde.'),
  R(/CORREIOS|\bECT\b|SEDEX|JADLOG|LOGGI|MELHOR ENVIO|KANGU/, 'D', 'DES013', 'M', 'Correios e envios.'),
  R(/GOOGLE ADS|FACEBOOK|FACEBK|META ?PLATFORMS|INSTAGRAM|\bADS\b|PUBLICIDADE|MARKETING/, 'D', 'DES011', 'M', 'Publicidade e marketing.'),
  R(/MICROSOFT|GOOGLE ?(WORKSPACE|CLOUD|\*)|ADOBE|DROPBOX|CANVA|ZOOM|OMIE|CONTA AZUL|BLING|TINY ERP|SOFTWARE|SISTEMA|ASSINATURA|APPLE\.COM|AMAZON WEB|HOSTINGER|GODADDY|REGISTRO\.BR/, 'D', 'DES008', 'M', 'Sistema, programa ou assinatura.'),
  R(/TRANSPORTADORA|FRETE|LOGISTICA|TRANSPORTES/, 'D', 'TRA005', 'M', 'Frete ou transportadora.'),
  R(/MATERIA(IS)? DE CONSTR|MADEIREIRA|FERRAGEM|FERRAGENS|VIDRACARIA|ALUMINIO|ESQUADRIA|MATERIAIS P(ARA)? MOVEIS|DEPOSITO DE MAT/, 'D', 'CMP002', 'B', 'Compra de material (confirme se é para revenda ou fabricação).'),
  R(/PAPELARIA|KALUNGA|MATERIAL DE ESCRIT/, 'D', 'DES005', 'M', 'Material de escritório.'),
  R(/HOTEL|POUSADA|BOOKING|AIRBNB|LATAM|\bGOL\b|AZUL LINHAS|PASSAGE/, 'D', 'TRA007', 'M', 'Passagem ou hospedagem.'),
  // entradas genéricas: palpite fraco, o cliente só confirma ou troca
  R(/PIX RECEBIDO|RECEBIMENTO PIX|PIX REC|TED RECEBIDA|DOC RECEBIDO|TRANSF(ERENCIA)? RECEBIDA|DEPOSITO|CRED(ITO)? (EM CONTA|TED|PIX)|RECEBIMENTO DE COBRANCA|LIQUIDACAO DE BOLETO|COBRANCA RECEBIDA/, 'C', 'REC003', 'B', 'Entrada de dinheiro: provavelmente recebimento de cliente.'),
];
const PORREF = new Map(PLANO_GENERICO.map((c) => [c.referencia, c]));
export const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ');
const digitos = (s: string) => s.replace(/\D/g, '');

/** Categoria genérica que serve para o sentido do lançamento? (C entrada, D saída) */
export const servePara = (tipo: string | null | undefined, sentido: 'C' | 'D') => !tipo || tipo === 'CD' || tipo === 'T' || tipo === sentido;

/** Sugestão pelas regras. `cnpjEmpresa`: se o próprio CNPJ da empresa aparece na descrição, é transferência entre contas dela. */
export function sugerirGenerico(descricao: string, valorCentavos: number, cnpjEmpresa?: string | null): { codigo: number; conf: 'A' | 'M' | 'B'; motivo: string } | null {
  const d = normalizar(descricao); const sentido: 'C' | 'D' = valorCentavos > 0 ? 'C' : 'D';
  const cnpj = digitos(cnpjEmpresa ?? '');
  if (cnpj.length === 14 && digitos(d).includes(cnpj)) {
    const c = PORREF.get(sentido === 'C' ? 'REC007' : 'SOC006')!;
    return { codigo: c.codigo, conf: 'A', motivo: 'O CNPJ da própria empresa aparece na descrição: transferência entre contas dela.' };
  }
  for (const r of REGRAS) {
    if ((r.sentido === 'CD' || r.sentido === sentido) && r.re.test(d)) {
      const c = PORREF.get(r.ref);
      if (c && servePara(c.tipo, sentido)) return { codigo: c.codigo, conf: r.conf, motivo: r.motivo };
    }
  }
  return null;
}
