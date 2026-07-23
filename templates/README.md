# Templates do Termo de Responsabilidade

## Arquivos versionados

- `original/term-original.docx`: cópia imutável do documento recebido em 20/07/2026.
  SHA-256: `d2ce126783963851340238bfe0973bcfa5e3910222b21d316c68cbfae720c28c`.
- `term.docx`: cópia operacional parametrizada, sem alterar o original. Os títulos
  `TERMO DE RESPONSABILIDADE` e `Equipamentos Eletrônicos e de Informática` ficam centralizados
  na largura útil da página, sem recuo lateral, em 11 pt e 10 pt, respectivamente.

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

## Regeneração da versão operacional

Na pasta `backend`:

```powershell
npm.cmd run template:prepare -- --input "C:\caminho\Termo de Responsabilidade [Template].docx"
```

O script preserva o primeiro original versionado, recusa sobrescrevê-lo com conteúdo diferente
e modifica somente a cópia operacional. A aprovação de conteúdo continua registrada no checklist
em `docs/legal-review-checklist.md`.
