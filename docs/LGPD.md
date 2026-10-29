# LGPD: inventário de dados e como o sistema ajuda

> **Isto não é parecer jurídico.** As colunas "base legal" e "retenção" são **propostas a validar** pelo escritório (controlador) com seu jurídico/encarregado de dados. O sistema oferece os mecanismos; as decisões são suas.

## Inventário de dados pessoais e sensíveis ao negócio
| Dado | Titular | Finalidade | Base legal | Retenção | Quem acessa |
|---|---|---|---|---|---|
| Nome, e-mail, senha (hash), 2FA (segredo cifrado), log de acessos | Usuários (escritório e clientes) | Autenticar e registrar quem fez o quê | *a definir* | Enquanto o acesso existir; anonimizável | Escritório (admin) |
| Razão social, CNPJ, e-mail de contato | Empresas clientes (podem ser pessoas físicas/MEI) | Prestação do serviço contábil | *a definir* (execução de contrato?) | Enquanto durar o contrato + prazo legal | Escritório; cliente só da própria empresa |
| Extratos e movimentações bancárias; documentos mensais | Empresas, sócios, terceiros citados nas descrições | Escrituração/conciliação contábil | *a definir* (obrigação legal/contrato?) | `RETENCAO_ANOS` (padrão 5, **definir**) | Escritório; cliente só da própria empresa |
| Nome e CPF de sócios; informes de rendimentos/lucros/pró-labore | Sócios | Disponibilizar informes ao sócio | *a definir* | `RETENCAO_ANOS` | Escritório; cliente **só se autorizado para aquele sócio**; CPF mascarado ao cliente |
| Mensagens de pendências | Usuários | Comunicação operacional | *a definir* | Junto da empresa | Escritório; cliente da empresa |

## Medidas implementadas
- **Minimização e acesso mínimo:** acesso por empresa e, nos informes, por sócio; CPF mascarado; e-mails sem conteúdo.
- **Segurança:** veja `docs/SEGURANCA.md` (2FA, criptografia, auditoria, backup cifrado).
- **Retenção:** `/admin/lgpd` mostra o que venceu e **descarta o conteúdo** dos arquivos vencidos (com confirmação, registrado na auditoria; metadados permanecem).
- **Direitos do titular (usuários):** `/admin/lgpd` → *Exportar dados* (JSON, sem senha/2FA) e *Anonimizar* (remove identificação e acesso; mantém o ID para a auditoria).
- **Rastreabilidade:** auditoria imutável de acessos e operações, inclusive downloads de informes e operações de LGPD.

## O que o sistema NÃO resolve sozinho (pendências para o escritório)
1. Definir **base legal** de cada tratamento e o **prazo de retenção** (e ajustar `RETENCAO_ANOS`).
2. Publicar **aviso/política de privacidade** e ajustar contratos com clientes (o escritório pode ser controlador dos próprios dados e operador dos dados dos clientes: avaliar).
3. Nomear o **encarregado** (DPO) e manter o registro das operações de tratamento; avaliar **RIPD** (relatório de impacto) dado o volume de dados financeiros.
4. Atender direitos de **sócios e terceiros** (cujo CPF/nomes aparecem em informes e descrições bancárias): hoje o atendimento é manual (busca/edição pelo escritório); a anonimização automática cobre usuários, não sócios.
5. Contratos com **fornecedores** que tocam dados (suboperadores): **Supabase** (banco e documentos), **Render** (site), **GitHub** (código e backups cifrados), **Brevo** (e-mails, só nome/e-mail e aviso sem conteúdo). Todos oferecem DPA (acordo de tratamento de dados) — aceite/arquive.
7. **Transferência internacional:** banco, documentos e site ficam nos **EUA (Virginia)**. A LGPD permite (art. 33) com garantias como cláusulas contratuais padrão (Resolução CD/ANPD nº 19/2024); informe isso na política de privacidade. Se preferir dados no Brasil: Supabase na região São Paulo (o site fica mais lento, porque o Render não tem servidor no Brasil).
6. Procedimento de **incidente** (comunicação à ANPD e aos titulares) com prazos definidos pelo jurídico: veja `docs/OPERACAO.md`.
