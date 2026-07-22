import { UnprocessableEntityException } from '@nestjs/common';

const REQUIRED_MARKERS = [
  '{employeeName}',
  '{cpf}',
  '{city}',
  '{day}',
  '{month}',
  '{year}',
  '{assetTags}',
  '{#equipments}',
  '{item}',
  '{quantity}',
  '{description}',
  '{serialLine}',
  '{assetLine}',
  '{accessories}',
  '{/equipments}'
];

export function parameterizeResponsibilityTemplateXml(xml: string) {
  if (hasAllRequiredMarkers(xml)) return xml;
  if (REQUIRED_MARKERS.some((marker) => visibleText(xml).includes(marker))) {
    throw new UnprocessableEntityException('Template DOCX parcialmente parametrizado');
  }

  let output = xml;
  output = replaceParagraph(
    output,
    (text) => text.includes('portador do CPF'),
    'Eu, {employeeName}, portador do CPF: {cpf}'
  );
  output = replaceParagraph(
    output,
    (text) => {
      const normalized = normalizeForMatch(text.trim());
      return normalized.startsWith('sao paulo,');
    },
    '{city}, {day} DE {month} DE {year}'
  );
  output = replaceParagraph(
    output,
    (text) => text.includes('[Nome do Colaborador]'),
    '{employeeName}'
  );
  output = replaceParagraph(
    output,
    (text) => normalizeForMatch(text).includes('patrimonio'),
    'PATRIMÔNIO – {assetTags}'
  );

  const rowPattern = /<w:tr\b[\s\S]*?<\/w:tr>/g;
  const rows = output.match(rowPattern) || [];
  const firstData = rows.find((row) => /2Z18QJ4|NotebookDell/i.test(visibleText(row)));
  if (!firstData) {
    throw new UnprocessableEntityException('Tabela de equipamentos esperada nao encontrada no DOCX');
  }
  output = output.replace(firstData, parameterizeEquipmentRow(firstData));
  for (const row of rows) {
    if (row !== firstData && /Celular/i.test(visibleText(row))) output = output.replace(row, '');
  }

  if (!hasAllRequiredMarkers(output)) {
    const missing = REQUIRED_MARKERS.filter((marker) => !visibleText(output).includes(marker));
    throw new UnprocessableEntityException(`Template DOCX sem marcadores obrigatorios: ${missing.join(', ')}`);
  }
  return output;
}

export function formatResponsibilityTemplateXml(xml: string) {
  const headings = new Set([
    'TERMO DE RESPONSABILIDADE',
    'Equipamentos Eletrônicos e de Informática'
  ]);
  return xml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (paragraph) => {
    if (!headings.has(visibleText(paragraph).trim())) return paragraph;
    return centerParagraph(paragraph);
  });
}

export function visibleTemplateText(xml: string) {
  return visibleText(xml);
}

function hasAllRequiredMarkers(xml: string) {
  const text = visibleText(xml);
  return REQUIRED_MARKERS.every((marker) => text.includes(marker));
}

function parameterizeEquipmentRow(row: string) {
  const cellPattern = /<w:tc\b[\s\S]*?<\/w:tc>/g;
  const cells = row.match(cellPattern) || [];
  if (cells.length < 4) {
    throw new UnprocessableEntityException('Tabela de equipamentos precisa ter quatro colunas');
  }
  const values = [
    '{#equipments}{item}',
    '{quantity}',
    '{description}{serialLine}{assetLine}',
    '{accessories}{/equipments}'
  ];
  let result = row;
  cells.slice(0, 4).forEach((cell, index) => {
    result = result.replace(cell, replaceTextNodes(cell, values[index]));
  });
  return result;
}

function replaceParagraph(xml: string, predicate: (text: string) => boolean, replacement: string) {
  const paragraphs = xml.match(/<w:p\b[\s\S]*?<\/w:p>/g) || [];
  const paragraph = paragraphs.find((item) => predicate(visibleText(item)));
  return paragraph ? xml.replace(paragraph, replaceTextNodes(paragraph, replacement)) : xml;
}

function replaceTextNodes(block: string, replacement: string) {
  let first = true;
  return block.replace(/<w:t\b([^>]*)>[\s\S]*?<\/w:t>/g, (_match, attributes: string) => {
    if (!first) return `<w:t${attributes}></w:t>`;
    first = false;
    return `<w:t${attributes}>${escapeXml(replacement)}</w:t>`;
  });
}

function centerParagraph(paragraph: string) {
  if (/<w:jc\b[^>]*\/>/.test(paragraph)) {
    return paragraph.replace(/<w:jc\b[^>]*\/>/, '<w:jc w:val="center"/>');
  }
  if (/<w:pPr\b[^>]*>/.test(paragraph)) {
    return paragraph.replace(/<w:pPr\b([^>]*)>/, '<w:pPr$1><w:jc w:val="center"/>');
  }
  return paragraph.replace(/<w:p\b([^>]*)>/, '<w:p$1><w:pPr><w:jc w:val="center"/></w:pPr>');
}

function visibleText(xml: string) {
  return [...xml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)]
    .map((match) => match[1])
    .join('')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function normalizeForMatch(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/Ã£/g, 'a')
    .replace(/Ã´/g, 'o')
    .toLocaleLowerCase('pt-BR');
}

function escapeXml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
