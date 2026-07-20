# Segurança e operação

## Controles já implementados

- Segredos fora do Git e do contexto Docker.
- Tokens OAuth Bitrix cifrados antes de persistir.
- Validação de `member_id`, domínio e `application_token` nos eventos.
- Códigos de abertura de uso único e curta duração.
- Tabelas internas com RLS e privilégios de `anon`/`authenticated` revogados.
- Bucket privado e URLs assinadas por cinco minutos.
- PDFs identificados por SHA-256 e eventos deduplicados.

## Decisões empresariais pendentes

- Retenção de rascunhos, termos assinados, logs e backups: `PENDENTE`.
- Periodicidade e responsável por teste de restauração: `PENDENTE`.
- Responsável por revisão trimestral de acessos: `PENDENTE`.
- Encarregado/canal para solicitações de titulares: `PENDENTE`.
- Procedimento interno de resposta a incidentes: `PENDENTE`.

## Rotina mínima para produção

- Revisar usuários `ADMIN`, `RH` e `TI` a cada trimestre e na saída de colaboradores.
- Rotacionar imediatamente segredos após suspeita de exposição.
- Manter dependências, WSL, Docker e imagens-base atualizados.
- Acompanhar falhas de webhook, backup e renovação OAuth nos logs.
- Testar restauração de banco e documentos na periodicidade aprovada.
- Executar os Advisors do Supabase após migrations e antes de cada liberação.
- Nunca registrar CPF completo, tokens ou conteúdo do PDF em logs.

Referência: [Guia de Segurança da Informação da ANPD](https://www.gov.br/anpd/pt-br/assuntos/noticias/anpd-publica-guia-de-seguranca-para-agentes-de-tratamento-de-pequeno-porte).
