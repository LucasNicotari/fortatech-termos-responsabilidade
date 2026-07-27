# ZapSign Sandbox — integração legada e desativada

## Estado

ZapSign **não é o provedor atual** de novos Termos de Responsabilidade. O fluxo oficial usa
`FORTADOCS`: o convite chega pelo chat, a identidade é confirmada pelo Bitrix24 e somente o
colaborador assina na tela interna.

Este arquivo existe apenas para explicar registros históricos com provedor `ZAPSIGN`. Não
configure token, webhook ou `SIGNATURE_PROVIDER=zapsign` em uma instalação nova.

O simulador totalmente local ainda reutiliza a interface e o enum `ZAPSIGN`, mas não chama a
ZapSign nem envia dados para fora da máquina. Isso é uma compatibilidade interna de testes, não
reativação do provedor.

## Como funcionava

O Sandbox enviava o PDF e dados do signatário a um serviço externo, disparava convite por e-mail
e devolvia o resultado por webhook. O backend validava o segredo, deduplicava o evento, baixava o
PDF concluído, calculava SHA-256 e o armazenava no bucket privado.

Esse modelo foi substituído porque o fluxo interno:

- mantém o usuário dentro do Bitrix24;
- entrega o convite pelo chat da pessoa;
- valida o ID conectado pelo próprio portal;
- oferece assinatura digitada, desenhada ou importada;
- permite notificados configuráveis sem torná-los signatários;
- conclui somente após salvar o PDF no Drive configurado.

## Compatibilidade

As classes e enums legados permanecem temporariamente para leitura e sincronização de documentos
antigos. A remoção dessa compatibilidade exige:

1. inventário dos registros `provider=ZAPSIGN`;
2. política de retenção aprovada;
3. comprovação de que PDFs, hashes e auditoria históricos continuarão acessíveis;
4. remoção controlada de segredos e webhooks externos;
5. migration aditiva, backup e teste de restauração.

Reativar ZapSign no futuro seria uma decisão arquitetural e de privacidade separada, com novo
contrato, análise LGPD, credenciais próprias e testes controlados. Não é uma simples troca de
URL.
