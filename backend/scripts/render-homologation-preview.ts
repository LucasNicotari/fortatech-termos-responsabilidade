import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import { parameterizeResponsibilityTemplateXml } from '../src/documents/template-parameterizer';

async function main() {
  const input = resolve(process.argv[2] || '../templates/term.docx');
  const output = resolve(process.argv[3] || '../.artifacts/homologation-preview.docx');
  const zip = new PizZip(await readFile(input));
  const xml = zip.file('word/document.xml')?.asText();
  if (!xml) throw new Error('DOCX sem word/document.xml');
  zip.file('word/document.xml', parameterizeResponsibilityTemplateXml(xml));

  const template = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
  template.render({
    employeeName: 'COLABORADOR DE HOMOLOGAÇÃO',
    cpf: '123.456.789-00',
    city: 'São Paulo',
    day: '20',
    month: 'JULHO',
    year: 2026,
    assetTags: 'HML-001, HML-002',
    equipments: [
      {
        item: '01', quantity: 1, description: 'Notebook de homologação',
        serialLine: '\nN/S: TESTE-ABC123', assetLine: '\nPatrimônio: HML-001',
        accessories: 'Carregador, mouse, teclado e suporte'
      },
      {
        item: '02', quantity: 1, description: 'Celular de homologação',
        serialLine: '\nN/S: TESTE-XYZ789', assetLine: '\nPatrimônio: HML-002',
        accessories: 'Carregador e cabo USB'
      }
    ]
  });
  const rendered = template.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, rendered);
  console.log(`${output} (${rendered.length} bytes)`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
