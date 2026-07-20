# Templates do Termo de Responsabilidade

## Arquivos versionados

- `original/term-original.docx`: cópia imutável do documento recebido em 20/07/2026.
  SHA-256: `d2ce126783963851340238bfe0973bcfa5e3910222b21d316c68cbfae720c28c`.
- `term.docx`: cópia parametrizada para homologação, com a marca
  `HOMOLOGAÇÃO — SEM VALIDADE`.

O original não deve ser editado. Alterações aprovadas pelo RH/jurídico devem gerar uma nova
versão, com novo hash e registro no banco.

## Contrato de marcadores

O modelo utiliza:

- `{employeeName}`, `{cpf}` e `{assetTags}`;
- `{city}`, `{day}`, `{month}` e `{year}`;
- `{#equipments}` e `{/equipments}` envolvendo uma linha de tabela;
- `{item}`, `{quantity}`, `{description}`, `{serialLine}`, `{assetLine}` e `{accessories}`.

O backend ainda converte o layout legado recebido, mas rejeita documentos parcialmente
parametrizados para evitar PDFs incompletos.

## Regeneração da versão de homologação

Na pasta `backend`:

```powershell
npm.cmd run template:prepare -- --input "C:\caminho\Termo de Responsabilidade [Template].docx"
```

O script preserva o primeiro original versionado e recusa sobrescrevê-lo com conteúdo diferente.
Para produção, crie uma versão aprovada separada e remova a marca somente após concluir o
checklist em `docs/legal-review-checklist.md`.
