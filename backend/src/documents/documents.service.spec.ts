import { readFileSync } from 'fs';
import { resolve } from 'path';
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import {
  parameterizeResponsibilityTemplateXml,
  visibleTemplateText
} from './template-parameterizer';

describe('DocumentsService template parameterization', () => {
  it('replaces legacy identity fields and converts equipment rows into a loop', () => {
    const paragraph = (text: string) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
    const cell = (text: string) => `<w:tc>${paragraph(text)}</w:tc>`;
    const row = (values: string[]) => `<w:tr>${values.map(cell).join('')}</w:tr>`;
    const xml = `<w:document><w:body>
      ${paragraph('Eu, __________, portador do CPF: ______')}
      ${paragraph('São Paulo, [30] DE [JUNHO] DE 2026')}
      ${paragraph('[Nome do Colaborador]')}
      ${row(['01', '01', 'NotebookDell 2Z18QJ4', 'Carregador'])}
      ${row(['01', '01', 'Celular', 'Carregador'])}
      ${paragraph('PATRIMÔNIO – []')}
    </w:body></w:document>`;

    const output = parameterizeResponsibilityTemplateXml(xml);
    expect(output).toContain('{employeeName}');
    expect(output).toContain('{#equipments}{item}');
    expect(output).toContain('{accessories}{/equipments}');
    expect(output).not.toContain('Celular');
    expect(output).toContain('{assetTags}');
  });

  it('renders the repository homologation DOCX with multiple equipment rows', () => {
    const path = resolve(__dirname, '../../../templates/term.docx');
    const zip = new PizZip(readFileSync(path));
    const xml = zip.file('word/document.xml')?.asText();
    expect(xml).toBeDefined();
    expect(visibleTemplateText(xml!)).toContain('HOMOLOGAÇÃO — SEM VALIDADE');
    zip.file('word/document.xml', parameterizeResponsibilityTemplateXml(xml!));

    const template = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
    template.render({
      employeeName: 'COLABORADOR TESTE',
      cpf: '123.456.789-00',
      city: 'São Paulo',
      day: '20',
      month: 'JULHO',
      year: 2026,
      assetTags: 'PAT-001, PAT-002',
      equipments: [
        {
          item: '01', quantity: 1, description: 'Notebook Teste',
          serialLine: '\nN/S: ABC123', assetLine: '\nPatrimônio: PAT-001', accessories: 'Carregador'
        },
        {
          item: '02', quantity: 1, description: 'Celular Teste',
          serialLine: '\nN/S: XYZ789', assetLine: '\nPatrimônio: PAT-002', accessories: 'Cabo USB'
        }
      ]
    });
    const rendered = template.getZip().generate({ type: 'nodebuffer' });
    const renderedXml = new PizZip(rendered).file('word/document.xml')?.asText() || '';
    const text = visibleTemplateText(renderedXml);
    expect(text).toContain('COLABORADOR TESTE');
    expect(text).toContain('123.456.789-00');
    expect(text).toContain('20 DE JULHO DE 2026');
    expect(text).toContain('Notebook Teste');
    expect(text).toContain('Celular Teste');
    expect(text).toContain('PAT-001, PAT-002');
    expect(text).not.toMatch(/\{[^}]+\}/);
  });
});
