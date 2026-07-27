import { readFileSync } from 'fs';
import { resolve } from 'path';
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import {
  DocumentsService,
  libreOfficeConversionArguments,
  responsibilityDateParts
} from './documents.service';
import {
  formatResponsibilityTemplateXml,
  parameterizeResponsibilityTemplateXml,
  visibleTemplateText
} from './template-parameterizer';

describe('DocumentsService template parameterization', () => {
  it('uses an isolated writable LibreOffice profile for each conversion', () => {
    const first = libreOfficeConversionArguments('/tmp/conversion-a', '/tmp/conversion-a/term.docx');
    const second = libreOfficeConversionArguments('/tmp/conversion-b', '/tmp/conversion-b/term.docx');

    expect(first[1]).toMatch(/^-env:UserInstallation=file:\/\//);
    expect(first[1]).toContain('conversion-a/libreoffice-profile');
    expect(second[1]).toContain('conversion-b/libreoffice-profile');
    expect(first[1]).not.toBe(second[1]);
    expect(first).toEqual(expect.arrayContaining(['--headless', '--convert-to', 'pdf']));
  });

  it('uses the Sao Paulo calendar date consistently around UTC midnight', () => {
    expect(responsibilityDateParts(new Date('2026-07-01T01:30:00.000Z'))).toEqual({
      day: '30',
      month: 'JUNHO',
      year: 2026
    });
  });

  it('serializes PDF conversions by default to bound LibreOffice memory', async () => {
    const service = new DocumentsService(
      { get: jest.fn().mockReturnValue(undefined) } as never,
      {} as never,
      {} as never
    );
    const gate = service as unknown as {
      acquireConversionSlot: () => Promise<void>;
      releaseConversionSlot: () => void;
    };
    let running = 0;
    let maximum = 0;
    const task = async () => {
      await gate.acquireConversionSlot();
      running += 1;
      maximum = Math.max(maximum, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running -= 1;
      gate.releaseConversionSlot();
    };

    await Promise.all([task(), task(), task()]);

    expect(maximum).toBe(1);
  });

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

  it('renders the repository DOCX without a homologation banner and with centered headings', () => {
    const path = resolve(__dirname, '../../../templates/term.docx');
    const zip = new PizZip(readFileSync(path));
    const xml = zip.file('word/document.xml')?.asText();
    expect(xml).toBeDefined();
    expect(visibleTemplateText(xml!)).not.toContain('HOMOLOGAÇÃO — SEM VALIDADE');
    const formatted = formatResponsibilityTemplateXml(parameterizeResponsibilityTemplateXml(xml!));
    const centeredHeadings = [...formatted.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)]
      .filter((match) => [
        'TERMO DE RESPONSABILIDADE',
        'Equipamentos Eletrônicos e de Informática'
      ].includes(visibleTemplateText(match[0]).trim()));
    expect(centeredHeadings).toHaveLength(2);
    centeredHeadings.forEach(([paragraph]) => {
      expect(paragraph).toContain('<w:jc w:val="center"/>');
      expect(paragraph).not.toContain('<w:ind');
    });
    expect(centeredHeadings[0][0]).toContain('<w:sz w:val="22"/>');
    expect(centeredHeadings[0][0]).toContain('<w:szCs w:val="22"/>');
    expect(centeredHeadings[1][0]).toContain('<w:sz w:val="20"/>');
    expect(centeredHeadings[1][0]).toContain('<w:szCs w:val="20"/>');
    zip.file('word/document.xml', formatted);

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
