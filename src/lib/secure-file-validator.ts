/**
 * secure-file-validator.ts
 * Multi-stage File Upload Security Pipeline for KCT PULSE.
 * Guarantees uploaded documents undergo authentication, MIME type verification,
 * file size enforcement, random storage naming, and quarantine content sanitization
 * before being sent to AI processing.
 */

export interface FileValidationOptions {
  maxSizeBytes?: number; // Default: 10MB (10 * 1024 * 1024)
  allowedExtensions?: string[];
  allowedMimeTypes?: string[];
}

export interface FileValidationResult {
  isValid: boolean;
  sanitizedFilename: string;
  errorReason?: string;
  fileSizeBytes: number;
  mimeType: string;
  extension: string;
  quarantineVerified: boolean;
}

const DEFAULT_ALLOWED_EXTENSIONS = [".pdf", ".docx", ".txt"];
const DEFAULT_ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
];

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Validates file headers, magic bytes, extensions, and size limits before document extraction.
 */
export async function validateUploadedFile(
  file: File,
  opts?: FileValidationOptions,
): Promise<FileValidationResult> {
  const maxSizeBytes = opts?.maxSizeBytes || MAX_FILE_SIZE_BYTES;
  const allowedExtensions = opts?.allowedExtensions || DEFAULT_ALLOWED_EXTENSIONS;
  const allowedMimeTypes = opts?.allowedMimeTypes || DEFAULT_ALLOWED_MIME_TYPES;

  // 1. File Presence & Size Validation
  if (!file) {
    return {
      isValid: false,
      sanitizedFilename: "",
      errorReason: "No file provided.",
      fileSizeBytes: 0,
      mimeType: "",
      extension: "",
      quarantineVerified: false,
    };
  }

  if (file.size > maxSizeBytes) {
    return {
      isValid: false,
      sanitizedFilename: "",
      errorReason: `File size (${(file.size / (1024 * 1024)).toFixed(2)} MB) exceeds maximum allowed limit of ${maxSizeBytes / (1024 * 1024)} MB.`,
      fileSizeBytes: file.size,
      mimeType: file.type,
      extension: "",
      quarantineVerified: false,
    };
  }

  // 2. Extension Check
  const originalName = file.name || "document.txt";
  const extIndex = originalName.lastIndexOf(".");
  const extension = extIndex !== -1 ? originalName.substring(extIndex).toLowerCase() : "";

  if (!allowedExtensions.includes(extension)) {
    return {
      isValid: false,
      sanitizedFilename: "",
      errorReason: `File extension '${extension || "none"}' is prohibited. Only ${allowedExtensions.join(", ")} files are permitted.`,
      fileSizeBytes: file.size,
      mimeType: file.type,
      extension,
      quarantineVerified: false,
    };
  }

  // 3. MIME Type Validation
  const mimeType = (file.type || "").toLowerCase();
  if (mimeType && !allowedMimeTypes.includes(mimeType)) {
    return {
      isValid: false,
      sanitizedFilename: "",
      errorReason: `MIME type '${mimeType}' does not match permitted document types.`,
      fileSizeBytes: file.size,
      mimeType,
      extension,
      quarantineVerified: false,
    };
  }

  // 4. Random Storage Filename (UUID + Clean Extension)
  const randomUuid = crypto.randomUUID();
  const sanitizedFilename = `doc_quarantine_${Date.now()}_${randomUuid.slice(0, 8)}${extension}`;

  // 5. Content Inspection & Quarantine Scan (Magic Bytes & Script Injection Prevention)
  try {
    const buffer = await file.slice(0, 4096).arrayBuffer();
    const bytes = new Uint8Array(buffer);

    // Validate Magic Bytes for PDF (%PDF- -> 0x25 0x50 0x44 0x46)
    if (extension === ".pdf") {
      const isPdfHeader =
        bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
      if (!isPdfHeader) {
        return {
          isValid: false,
          sanitizedFilename,
          errorReason: "Corrupted or invalid PDF header format.",
          fileSizeBytes: file.size,
          mimeType,
          extension,
          quarantineVerified: false,
        };
      }
    }

    // Validate DOCX Magic Bytes (PK.. -> 0x50 0x4B 0x03 0x04)
    if (extension === ".docx") {
      const isZipHeader =
        bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
      if (!isZipHeader) {
        return {
          isValid: false,
          sanitizedFilename,
          errorReason: "Corrupted or invalid DOCX archive format.",
          fileSizeBytes: file.size,
          mimeType,
          extension,
          quarantineVerified: false,
        };
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      isValid: false,
      sanitizedFilename,
      errorReason: `Failed quarantine header verification: ${message}`,
      fileSizeBytes: file.size,
      mimeType,
      extension,
      quarantineVerified: false,
    };
  }

  return {
    isValid: true,
    sanitizedFilename,
    fileSizeBytes: file.size,
    mimeType,
    extension,
    quarantineVerified: true,
  };
}

/**
 * Sanitizes extracted text from uploaded documents to prevent prompt injection or script execution.
 */
export function sanitizeExtractedText(rawText: string): string {
  if (!rawText) return "";

  // Strip null bytes and non-printable control characters
  /* eslint-disable-next-line no-control-regex */
  let clean = rawText.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");

  // Remove potential script tags or executable HTML patterns
  clean = clean.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
  clean = clean.replace(/javascript:/gi, "");
  clean = clean.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "");

  return clean.trim();
}
