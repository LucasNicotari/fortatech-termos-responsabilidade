# Seguranca e operacao

## Controles implementados

- Segredos ignorados pelo Git e ausentes do build do frontend.
- Dominio Bitrix e `frame-ancestors` restritos ao portal FortaTech.
- Tokens OAuth cifrados antes da persistencia.
- Instalacao validada por dominio, `member_id` e `application_token`.
- Convite de assinatura com 256 bits, validade de sete dias e token salvo apenas como hash.
- Identidade do signatario confirmada por `user.current`.
- Nome, e-mail, cargo e departamento do colaborador reconsultados no backend pelo ID Bitrix24;
  valores enviados pelo navegador não são a fonte de verdade.
- CPF validado pelos dígitos verificadores, normalizado antes da persistência e omitido das
  respostas de listagem que não precisam dele.
- Codigo de abertura com uso unico e validade de dois minutos.
- Sessao `SIGN_DOCUMENT` isolada das APIs administrativas.
- Operações de criação, sincronização, nova tentativa, arquivamento e remoção protegidas pela
  permissão de operador; logs administrativos exigem perfil `ADMIN`.
- Tabelas `app_*` com RLS e DML de `anon`/`authenticated` revogado.
- Bucket privado, URLs temporarias e limite de tipo/tamanho.
- Imagem da assinatura normalizada para PNG e limitada a 1 MB, 4096×2048 e quatro milhões de
  pixels no backend.
- Conclusao atomica e protecao contra assinatura duplicada.
- Remoção em lote transacional e lógica; PDFs/hashes/auditoria são preservados e assinaturas ainda
  não arquivadas no Drive não podem ser ocultadas.
- PDF final e imagem registrados por SHA-256.
- Conclusao condicionada a confirmacao do arquivo no Drive do Bitrix24.
- Conteúdo Base64, texto de mensagens, nomes de arquivos e parâmetros sensíveis removidos dos logs
  de integração.
- Consulta prévia de eventos reduz notificações duplicadas em uma instância.
- CPF, tokens, documento e URL de assinatura ausentes dos logs tecnicos.
- Chamadas HTTP ao Bitrix24 com timeout de 15 segundos e downloads de PDF com timeout e limite de
  tamanho.
- Containers locais ligados somente a `127.0.0.1`, com limite de PIDs e rotação de logs.

## Monitoramento minimo

- `/health` do backend e disponibilidade do frontend;
- falhas `SEND_REQUEST_ERROR`, `BITRIX_ERROR` e `BITRIX_TERM_NOTIFICATION_ERROR`;
- convites expirados sem conclusao;
- assinaturas `SIGNED` com `archive_status=FAILED` ou `PENDING`;
- expiracao e renovacao do OAuth Bitrix;
- tamanho e espera da fila de conversão PDF;
- duração/erros da sincronização limitada a 100 itens e concorrência cinco;
- uso e acerto do cache de diretório Bitrix24;
- consumo e suspensao da instancia Render;
- espaço de imagens, volumes e cache de build Docker separadamente da memória RAM;
- Security e Performance Advisors depois de migrations.

## Decisoes obrigatorias para producao

- retencao de rascunhos, termos, imagens incorporadas, logs e backups;
- prazo e processo de eliminação física após a remoção lógica;
- rotina e responsavel pelo teste de restauracao;
- revisao trimestral de acessos e desligamentos;
- canal para titulares de dados e resposta a incidentes;
- aprovacao juridica do termo e da forma de assinatura;
- responsavel por promover template e ambiente.
- migração do Drive pessoal para uma área empresarial/conta técnica com continuidade definida.

## Limites de escalabilidade

O cache do diretório, a fila de LibreOffice e o limitador de sincronização são locais a cada
processo. Eles protegem uma instância, mas não coordenam várias réplicas. Antes de escala
horizontal:

1. adotar outbox transacional para chat, notificações e Drive;
2. executar expiração, sincronização e novas tentativas em jobs idempotentes;
3. usar fila e lock distribuídos para conversão e assinatura;
4. separar `prisma migrate deploy` do startup da API;
5. definir métricas, alertas, dead-letter queue e procedimento de reprocessamento;
6. aprovar e automatizar a política de retenção.

A outbox deve incluir chave idempotente com restrição única por termo, estado e destinatário; a
consulta `findFirst` atual, sozinha, não elimina corrida entre réplicas.

## Resposta a incidente

1. Suspenda novos envios sem apagar evidencias.
2. Revogue ou rotacione a credencial afetada.
3. Atualize o segredo no Render e reinstale o aplicativo se o OAuth foi afetado.
4. Revogue convites ativos relacionados ao incidente.
5. Verifique logs sanitizados, eventos e acessos.
6. Registre impacto, periodo e medidas adotadas.
7. Siga o procedimento empresarial e de privacidade aprovado.

Referencia: [Guia de Seguranca da Informacao da ANPD](https://www.gov.br/anpd/pt-br/assuntos/noticias/anpd-publica-guia-de-seguranca-para-agentes-de-tratamento-de-pequeno-porte).
