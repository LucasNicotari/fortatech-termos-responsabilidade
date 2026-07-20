import { createHash } from 'crypto';
import { existsSync } from 'fs';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import PizZip from 'pizzip';
import {
  addHomologationWatermark,
  parameterizeResponsibilityTemplateXml
} from '../src/documents/template-parameterizer';

function option(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const inputArg = option('--input');
  if (!inputArg) throw new Error('Informe --input com o caminho do DOCX aprovado');

  const input = resolve(inputArg);
  const output = resolve(option('--output') || '../templates/term.docx');
  const originalOutput = resolve(option('--original-output') || '../templates/original/term-original.docx');
  if (input === output || input === originalOutput || output === originalOutput) {
    throw new Error('Entrada, original versionado e template de homologacao precisam ser arquivos diferentes');
  }

  const source = await readFile(input);
  if (existsSync(originalOutput)) {
    const stored = await readFile(originalOutput);
    if (!stored.equals(source)) {
      throw new Error('O original versionado ja existe com outro conteudo; nao foi sobrescrito');
    }
  } else {
    await mkdir(dirname(originalOutput), { recursive: true });
    await writeFile(originalOutput, source);
  }

  const zip = new PizZip(source);
  const documentXml = zip.file('word/document.xml')?.asText();
  if (!documentXml) throw new Error('DOCX sem word/document.xml');
  const parameterized = parameterizeResponsibilityTemplateXml(documentXml);
  zip.file('word/document.xml', addHomologationWatermark(parameterized));
  const homologation = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, homologation);

  const hash = (value: Buffer) => createHash('sha256').update(value).digest('hex');
  console.log(JSON.stringify({
    original: { path: originalOutput, bytes: source.length, sha256: hash(source) },
    homologation: { path: output, bytes: homologation.length, sha256: hash(homologation) }
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
