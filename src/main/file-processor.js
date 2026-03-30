import * as path from 'path';
import * as fs from 'fs/promises';
import * as fssync from 'fs';

/**
 * Determine content type from file extension
 */
function getContentTypeFromExt(fileName) {
  const ext = fileName.slice(fileName.lastIndexOf('.')).toLowerCase();

  // Document types
  if (['.pdf', '.docx', '.doc', '.docm', '.odt', '.rtf', '.xlsx', '.xls', '.xlsm', '.ods', '.pptx', '.ppt', '.pptm', '.odp'].includes(ext)) {
    return 'document';
  }

  // Image types
  if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.tiff', '.heic', '.ico', '.avif'].includes(ext)) {
    return 'image';
  }

  // Text types
  if (['.txt', '.csv', '.json', '.xml', '.yaml', '.yml', '.md', '.html', '.htm'].includes(ext)) {
    return 'text';
  }

  return null; // Unsupported
}

/**
 * Process a file: detect type, extract if needed, return metadata
 */
export async function processFile(filePath, outputFolder) {
  const fileName = path.basename(filePath);
  const contentType = getContentTypeFromExt(fileName);

  if (!contentType) {
    return { error: `Unsupported file type: ${fileName}` };
  }

  const baseName = fileName.replace(/\.[^.]+$/, '');
  const outputPath = path.join(
    outputFolder,
    contentType === 'document' ? `${baseName}.md` : `${baseName}.ref`
  );

  // Extract PDFs to markdown
  if (fileName.toLowerCase().endsWith('.pdf')) {
    const extracted = await extractPdfToMarkdown(filePath, outputPath);
    if (extracted.error) {
      return { error: extracted.error };
    }
  }

  // Extract Office documents to markdown
  const officeExtensions = ['.docx', '.doc', '.docm', '.odt', '.rtf', '.xlsx', '.xls', '.xlsm', '.ods', '.pptx', '.ppt', '.pptm', '.odp'];
  if (officeExtensions.some(ext => fileName.toLowerCase().endsWith(ext))) {
    const extracted = await extractOfficeToMarkdown(filePath, outputPath);
    if (extracted.error) {
      return { error: extracted.error };
    }
  }

  // Copy reference files (images, text) as-is
  if (contentType === 'image' || contentType === 'text') {
    await fs.copyFile(filePath, outputPath);
  }

  return {
    contentType,
    outputPath,
  };
}

async function extractPdfToMarkdown(filePath, outputPath) {
  try {
    const { LiteParse } = await import('@llamaindex/liteparse');
    const liteParse = new LiteParse({ ocrEnabled: false });
    const result = await liteParse.parse(filePath);
    await fs.writeFile(outputPath, result.text);
    return { success: true };
  } catch (error) {
    return { error: error.message };
  }
}

async function extractOfficeToMarkdown(filePath, outputPath) {
  try {
    const { parseOffice } = await import('officeparser');
    const result = await parseOffice(filePath);
    const text = serializeAstToText(result);
    await fs.writeFile(outputPath, text);
    return { success: true };
  } catch (error) {
    return { error: error.message };
  }
}

function serializeAstToText(ast) {
  if (!ast) return '';
  if (typeof ast === 'string') return ast;
  if (Array.isArray(ast)) return ast.map(serializeAstToText).join('\n');
  if (ast.text) return ast.text;
  if (ast.children) return serializeAstToText(ast.children);
  return '';
}
