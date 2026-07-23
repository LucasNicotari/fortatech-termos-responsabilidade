# Segurança e operação

## Controles implementados

- Segredos ignorados pelo Git e fora do contexto de build do frontend.
- Domínio Bitrix e `frame-ancestors` restritos a `https://fortaeqt.bitrix24.com.br`.
- Tokens OAuth Bitrix cifrados antes da persistência.
- Instalação e eventos validados por domínio, `member_id` e `application_token`.
- Código de abertura com hash, uso único e validade de dois minutos.
- JWT emitido somente depois da abertura pelo Bitrix24.
- Acesso, perfil, operação e notificações independentes e auditáveis.
- Tabelas `app_*` com RLS e DML de `anon`/`authenticated` revogado.
- Bucket privado, URLs temporárias e limite de tipo/tamanho.
- Eventos Bitrix B2E autenticados pelo `application_token` e deduplicados.
- Documento bloqueado após envio; reivindicação atômica evita envio duplicado.
- PDF final validado, limitado, armazenado com SHA-256 e trilha de eventos.
- Respostas de integração sanitizadas; CPF, e-mail, nome, tokens e URLs de assinatura são ocultados dos erros.

## Monitoramento mínimo

- `/health` do backend e disponibilidade do frontend.
- falhas `SEND_REQUEST_ERROR`, `BITRIX_ERROR` e `BITRIX_TERM_NOTIFICATION_ERROR`;
- eventos de webhook em `FAILED`;
- assinaturas concluídas com `archive_status` diferente de `ARCHIVED`;
- expiração/renovação do OAuth Bitrix;
- consumo e suspensão da instância Render;
- Security e Performance Advisors após migrations.

## Decisões empresariais ainda obrigatórias para produção

- retenção de rascunhos, termos, logs e backups;
- rotina e responsável pelo teste de restauração;
- revisão trimestral de acessos e procedimento de desligamento;
- encarregado/canal para titulares de dados;
- resposta a incidentes e prazos internos;
- aprovação jurídica do termo e base aplicável para descontos;
- responsável formal por promover template e ambiente para produção.

## Resposta a incidente

1. suspenda o envio sem apagar evidências;
2. revogue/rotacione a credencial afetada no provedor;
3. atualize o segredo no Render e reinstale o aplicativo se o OAuth Bitrix foi afetado;
4. verifique logs sanitizados, webhooks e acessos sem copiar CPF ou documento;
5. registre impacto, período e medidas adotadas;
6. siga o processo de comunicação aprovado pela empresa e pela área responsável por privacidade.

Referência: [Guia de Segurança da Informação da ANPD](https://www.gov.br/anpd/pt-br/assuntos/noticias/anpd-publica-guia-de-seguranca-para-agentes-de-tratamento-de-pequeno-porte).
