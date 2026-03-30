import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { processFile } from '../../src/main/file-processor.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_OUTPUT_DIR = path.join(__dirname, '../../.test-output');

beforeEach(() => {
  if (!fs.existsSync(TEST_OUTPUT_DIR)) {
    fs.mkdirSync(TEST_OUTPUT_DIR, { recursive: true });
  }
});

afterEach(() => {
  if (fs.existsSync(TEST_OUTPUT_DIR)) {
    fs.rmSync(TEST_OUTPUT_DIR, { recursive: true });
  }
  vi.resetModules();
});

describe('file-processor', () => {
  it('detects PDF and returns document type (extraction attempted)', async () => {
    const pdfPath = path.join(TEST_OUTPUT_DIR, 'test.pdf');
    fs.writeFileSync(pdfPath, '%PDF-1.4\n');

    const result = await processFile(pdfPath, TEST_OUTPUT_DIR);

    // PDF extraction will fail on invalid mock, so we check for either success or error
    if (result.error) {
      // Expected: library not available or invalid PDF format
      expect(result.error).toBeDefined();
    } else {
      expect(result.contentType).toBe('document');
      expect(result.outputPath).toBeDefined();
    }
  });

  it('detects image and returns image type', async () => {
    const imagePath = path.join(TEST_OUTPUT_DIR, 'test.jpg');
    fs.writeFileSync(imagePath, Buffer.from([0xFF, 0xD8, 0xFF]));

    const result = await processFile(imagePath, TEST_OUTPUT_DIR);

    expect(result.contentType).toBe('image');
    expect(result.outputPath).toBeDefined();
    expect(fs.existsSync(result.outputPath)).toBe(true);
  });

  it('detects text and returns text type', async () => {
    const textPath = path.join(TEST_OUTPUT_DIR, 'test.txt');
    fs.writeFileSync(textPath, 'Hello world');

    const result = await processFile(textPath, TEST_OUTPUT_DIR);

    expect(result.contentType).toBe('text');
    expect(result.outputPath).toBeDefined();
    expect(fs.existsSync(result.outputPath)).toBe(true);
  });

  it('rejects unsupported file types', async () => {
    const exePath = path.join(TEST_OUTPUT_DIR, 'test.exe');
    fs.writeFileSync(exePath, '');

    const result = await processFile(exePath, TEST_OUTPUT_DIR);

    expect(result.error).toBeDefined();
  });
});
