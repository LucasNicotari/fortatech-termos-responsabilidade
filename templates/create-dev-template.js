const { writeFileSync } = require('node:fs');
const { join } = require('node:path');
const PizZip = require('../backend/node_modules/pizzip');

const zip = new PizZip();
zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);
zip.folder('_rels').file('.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);

const paragraph = (text, bold = false) => `<w:p><w:r>${bold ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
const cell = (text) => `<w:tc><w:tcPr><w:tcW w:w="2400" w:type="dxa"/></w:tcPr>${paragraph(text)}</w:tc>`;
const row = (values) => `<w:tr>${values.map(cell).join('')}</w:tr>`;

const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paragraph('MODELO DE DESENVOLVIMENTO - SUBSTITUIR PELO DOCUMENTO APROVADO', true)}
    ${paragraph('TERMO DE RESPONSABILIDADE', true)}
    ${paragraph('Eu, [Nome do Colaborador], portador do CPF: 000.000.000-00, declaro ter recebido os equipamentos abaixo e me responsabilizo por sua guarda e uso profissional.')}
    ${paragraph('PATRIMONIO - 000000')}
    <w:tbl>
      <w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders><w:top w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/><w:insideH w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/></w:tblBorders></w:tblPr>
      ${row(['ITEM', 'QTD.', 'DESCRICAO', 'ACESSORIOS'])}
      ${row(['01', '1', 'NotebookDell 2Z18QJ4', 'Carregador'])}
      ${row(['02', '1', 'Celular', '-'])}
    </w:tbl>
    ${paragraph('Sao Paulo, 01 DE JANEIRO DE 2026')}
    ${paragraph('________________________________________')}
    ${paragraph('[Nome do Colaborador]')}
    <w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>
  </w:body>
</w:document>`;

zip.folder('word').file('document.xml', documentXml);
const output = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
const target = join(__dirname, 'term.docx');
writeFileSync(target, output);
console.log(`Template de desenvolvimento criado em ${target}`);
