/**
 * document-parser.ts
 * Extracts plain text from uploaded PDF, DOCX, or TXT files — runs entirely in the browser.
 */

export type SupportedFileType = "pdf" | "docx" | "txt";

export function getFileType(file: File): SupportedFileType | null {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return "pdf";
  if (name.endsWith(".docx")) return "docx";
  if (name.endsWith(".txt") || name.endsWith(".md")) return "txt";
  return null;
}

/** Extract text from a plain .txt or .md file */
async function extractFromTxt(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve((e.target?.result as string) ?? "");
    reader.onerror = () => reject(new Error("Failed to read text file"));
    reader.readAsText(file);
  });
}

/** Extract text from a .docx file using mammoth */
async function extractFromDocx(file: File): Promise<string> {
  const mammoth = await import("mammoth");
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  if (!result.value) throw new Error("Could not extract text from DOCX file");
  return result.value;
}

/** Extract text from a PDF file using pdfjs-dist */
async function extractFromPdf(file: File): Promise<string> {
  // Dynamically import pdfjs-dist to keep initial bundle size small
  const pdfjsLib = await import("pdfjs-dist");

  // Point the worker to the CDN so we don't need to copy the worker file
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const textParts: string[] = [];

  // Cap at 30 pages so we don't send a massive prompt to the AI
  const maxPages = Math.min(pdf.numPages, 30);

  for (let i = 1; i <= maxPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item: any) => ("str" in item ? item.str : ""))
      .join(" ");
    textParts.push(pageText);
  }

  return textParts.join("\n\n");
}

/**
 * Main entry point — auto-detects file type and returns extracted text.
 * Throws a user-friendly error if file type is unsupported or parsing fails.
 */
export async function extractTextFromDocument(file: File): Promise<string> {
  // 5 MB guard
  if (file.size > 5 * 1024 * 1024) {
    throw new Error(
      "File is too large (max 5 MB). Please upload a smaller document."
    );
  }

  const type = getFileType(file);
  if (!type) {
    throw new Error(
      "Unsupported file type. Please upload a PDF, DOCX, or TXT file."
    );
  }

  let text = "";
  if (type === "txt") text = await extractFromTxt(file);
  else if (type === "docx") text = await extractFromDocx(file);
  else if (type === "pdf") text = await extractFromPdf(file);

  // Trim and cap the text to ~8000 characters so the AI prompt stays manageable
  text = text.trim();
  if (text.length > 8000) {
    text = text.slice(0, 8000) + "\n\n[Document truncated for processing...]";
  }

  if (!text) {
    throw new Error(
      "No readable text found in the document. Try a different file."
    );
  }

  return text;
}
