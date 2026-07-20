# Supabase

O projeto usa Supabase PostgreSQL como banco principal e Supabase Storage para os documentos.

## Conexoes

- `DATABASE_URL`: transaction pooler para runtime do Prisma.
- `DIRECT_URL`: session pooler ou conexao direta para migrations.
- `SUPABASE_URL`: URL HTTPS do projeto.
- `SUPABASE_SECRET_KEY`: chave secreta `sb_secret_...`, usada somente no backend.

Enquanto um projeto Supabase remoto nao estiver configurado, o desenvolvimento pode usar
`STORAGE_DRIVER=local`. Os arquivos ficam em `.data/storage` e sao entregues apenas por URLs
temporarias assinadas. Esse modo e destinado a desenvolvimento; homologacao e producao devem
usar o bucket privado do Supabase.

## Storage

- Bucket privado: `responsibility-terms`.
- Prefixos: `templates/`, `unsigned/` e `signed/`.
- Limite configurado: 20 MB por objeto.
- MIME types: PDF e DOCX.
- O frontend recebe apenas URLs assinadas por cinco minutos depois de passar pela autorizacao local.
- Nao configure chaves `NEXT_PUBLIC_*` ou `VITE_*` para o Supabase.

O bucket e criado idempotentemente no primeiro uso. Como somente o backend usa chave secreta, nao existem politicas publicas em `storage.objects`.

## RLS e Data API

Todas as tabelas `app_*` possuem RLS habilitado. As roles `anon` e `authenticated` tem seus privilegios revogados; Prisma usa a conexao PostgreSQL do backend, sem Data API.

Depois de migrations, execute o Security Advisor e confirme que nenhuma tabela interna ficou exposta.

## Cuidados

- Nao use `prisma migrate reset` no projeto remoto.
- Nao exponha `SUPABASE_SECRET_KEY` ou `SERVICE_ROLE_KEY` no navegador.
- Nao remova schemas internos `auth`, `storage`, `realtime` e `vault`.
- Corrija a URL do projeto se o hostname nao resolver antes do primeiro preview.
