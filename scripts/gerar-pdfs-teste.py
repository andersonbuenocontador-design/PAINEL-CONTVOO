# Gera PDFs FICTÍCIOS (sem dados reais) para testar o leitor de PDF. Uso: python3 scripts/gerar-pdfs-teste.py
from reportlab.pdfgen import canvas
D = 'tests/fixtures/extratos-pdf/'

def banrisul():
    c = canvas.Canvas(D + 'banrisul_ficticio.pdf'); c.setFont('Courier', 9); y = 800
    def L(parts):
        nonlocal y
        for x, s in parts: c.drawString(x, y, s)
        y -= 14
    L([(40, 'BANRISUL S.A.  EXTRATO DE CONTA CORRENTE')])
    L([(40, 'AGENCIA: 0001')]); L([(40, 'CONTA....: 12345-6')]); L([(40, 'NOME.....: EMPRESA EXEMPLO LTDA')])
    L([(40, 'MOVIMENTOS OUT/2026')])
    L([(40, 'SALDO ANT EM 30/09/2026'), (330, '2.000,00')])
    for dia, h, doc, v in [('01', 'PIX RECEBIDO', 'AB1234', '1.500,00'), ('02', 'PAGAMENTO FORNECEDOR', 'DOC987', '450,00-'), ('05', 'TARIFA MENSAL', 'TAR001', '39,90-'), ('', 'COBRANCA RECEBIDA', 'COB777', '600,00')]:
        L([(40, dia), (70, h), (260, doc), (330, v)])
    L([(40, '31'), (70, 'SALDO NA DATA'), (330, '3.610,10')])
    c.save()

def generico():
    c = canvas.Canvas(D + 'tabela_generica_ficticia.pdf'); c.setFont('Helvetica', 9)
    c.drawString(40, 800, 'EXTRATO FICTICIO - BANCO EXEMPLO')
    c.drawString(40, 786, 'Agencia: 0001   Conta: 98765-4')
    y = 760
    for x, s in [(40, 'Data'), (110, 'Histórico'), (300, 'Documento'), (370, 'Débito'), (440, 'Crédito'), (510, 'Saldo')]: c.drawString(x, y, s)
    y -= 16
    for d, h, doc, db, cr, sd in [('01/10/2026', 'PIX RECEBIDO CLIENTE A', 'E2E1', '', '1.000,00', '6.000,00'), ('02/10/2026', 'PAGAMENTO ENERGIA', 'D22', '300,00', '', '5.700,00'), ('03/10/2026', 'TARIFA', 'T33', '25,50', '', '5.674,50')]:
        for x, s in [(40, d), (110, h), (300, doc), (370, db), (440, cr), (510, sd)]:
            if s: c.drawString(x, y, s)
        y -= 14
    c.save()

def vazio():
    c = canvas.Canvas(D + 'sem_texto.pdf'); c.rect(50, 50, 200, 200); c.save()
banrisul(); generico(); vazio()
