// The text a downloaded PDF file prints, read from the file itself (test-plan.md AC-01 row: "the
// downloaded PDF still shows …"). tests/support/pdf-text.ts reads the React element tree instead,
// which never touches the renderer that produced the bytes the Freelancer gets.
import type { Download } from '@playwright/test';
import { extractText } from 'unpdf';

/** Every page's text joined, with runs of whitespace collapsed so split runs still match. */
export async function downloadedPdfText(download: Download): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of await download.createReadStream()) chunks.push(chunk as Buffer);
  const bytes = new Uint8Array(Buffer.concat(chunks));
  if (Buffer.from(bytes.subarray(0, 5)).toString() !== '%PDF-') {
    throw new Error('The download is not a PDF file.');
  }
  const { text } = await extractText(bytes, { mergePages: true });
  return text.replace(/\s+/g, ' ');
}

