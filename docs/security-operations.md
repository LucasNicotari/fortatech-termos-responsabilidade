# Seguranca e operacao

## Controles implementados

- Segredos ignorados pelo Git e ausentes do build do frontend.
- Dominio Bitrix e `frame-ancestors` restritos ao portal FortaTech.
- Tokens OAuth cifrados antes da persistencia.
- Instalacao validada por dominio, `member_id` e `application_token`.
- Convite de assinatura com 256 bits, validade de sete dias e token salvo apenas como hash.
- Identidade do signatario confirmada por `user.current`.
- Codigo de abertura com uso unico e validade de dois minutos.
- Sessao `SIGN_DOCUMENT` isolada das APIs administrativas.
- Tabelas `app_*` com RLS e DML de `anon`/`authenticated` revogado.
- Bucket privado, URLs temporarias e limite de tipo/tamanho.
- Imagem da assinatura normalizada para PNG e limitada a 1 MB no backend.
- Conclusao atomica e protecao contra assinatura duplicada.
- PDF final e imagem registrados por SHA-256.
- Eventos de notificacao idempotentes por termo, estado e usuario.
- CPF, tokens, documento e URL de assinatura ausentes dos logs tecnicos.

## Monitoramento minimo

- `/health` do backend e disponibilidade do frontend;
- falhas `SEND_REQUEST_ERROR`, `BITRIX_ERROR` e `BITRIX_TERM_NOTIFICATION_ERROR`;
- convites expirados sem conclusao;
- assinaturas concluidas com `archive_status` diferente de `ARCHIVED`;
- expiracao e renovacao do OAuth Bitrix;
- consumo e suspensao da instancia Render;
- Security e Performance Advisors depois de migrations.

## Decisoes obrigatorias para producao

- retencao de rascunhos, termos, imagens incorporadas, logs e backups;
- rotina e responsavel pelo teste de restauracao;
- revisao trimestral de acessos e desligamentos;
- canal para titulares de dados e resposta a incidentes;
- aprovacao juridica do termo e da forma de assinatura;
- responsavel por promover template e ambiente.

## Resposta a incidente

1. Suspenda novos envios sem apagar evidencias.
2. Revogue ou rotacione a credencial afetada.
3. Atualize o segredo no Render e reinstale o aplicativo se o OAuth foi afetado.
4. Revogue convites ativos relacionados ao incidente.
5. Verifique logs sanitizados, eventos e acessos.
6. Registre impacto, periodo e medidas adotadas.
7. Siga o procedimento empresarial e de privacidade aprovado.

Referencia: [Guia de Seguranca da Informacao da ANPD](https://www.gov.br/anpd/pt-br/assuntos/noticias/anpd-publica-guia-de-seguranca-para-agentes-de-tratamento-de-pequeno-porte).
