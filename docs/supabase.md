# Supabase

O ambiente de homologação usa PostgreSQL e Storage do projeto Supabase atual.

## Conexões

- `DATABASE_URL`: transaction pooler usado pelo Prisma durante o runtime.
- `DIRECT_URL`: session pooler, porta 5432, usado nas migrations.
- `SUPABASE_URL`: URL HTTPS do projeto.
- `SUPABASE_SECRET_KEY`: chave `sb_secret_...`, exclusiva do backend.

As credenciais ficam no `.env` local e nos segredos do Render. Nenhuma chave Supabase aparece no bundle do frontend.

## Storage

- Bucket: `responsibility-terms`.
- Visibilidade: privada.
- Limite por objeto: 20 MB.
- MIME types: PDF e DOCX.
- Prefixos: `templates/`, `unsigned/` e `signed/`.
- URLs temporárias: cinco minutos.

O backend cria e confere o bucket idempotentemente. Não há política pública em `storage.objects`.

## Banco e RLS

As 18 tabelas `app_*` possuem RLS habilitado. As roles `anon` e `authenticated` não têm
permissões `INSERT`, `UPDATE`, `DELETE` ou `TRUNCATE`. A aplicação acessa as tabelas somente pela
conexão PostgreSQL do backend; a chave secreta nunca vai para o navegador.

A mudança de 2026 que deixou novas tabelas fora da Data API por padrão não altera esta arquitetura, pois o FortaDocs não consulta as tabelas pelo navegador nem pela Data API.

## Publicação de migrations

```powershell
Set-Location backend
npm.cmd run prisma:generate
npm.cmd run prisma:deploy
npm.cmd run prisma:seed
```

No Render, o entrypoint executa `prisma migrate deploy` e o seed idempotente antes de iniciar a API. Após cada publicação:

1. execute `prisma migrate status` com `DIRECT_URL`;
2. confirme as 13 migrations e as 18 tabelas `app_*`;
3. confirme RLS e ausência de DML para `anon`/`authenticated`;
4. execute Security Advisor e Performance Advisor no Dashboard;
5. valide upload, download, URL assinada, SHA-256 e remoção de um arquivo sintético.

Não execute `prisma migrate reset`, não exponha a chave secreta e não altere os schemas `auth`, `storage`, `realtime` ou `vault`.

O CPF e os PDFs assinados são dados pessoais. O bucket privado e a remoção lógica da tela não
definem, por si só, o prazo de guarda. Antes da produção, aprove e automatize uma política de
retenção para rascunhos, PDFs, eventos, logs e backups, com teste de restauração e eliminação
auditável.
