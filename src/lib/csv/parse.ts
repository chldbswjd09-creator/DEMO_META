// CSV 파싱 — 브라우저에서 처리. 인코딩(UTF-8 / UTF-8 BOM / CP949·EUC-KR)과
// 구분자(쉼표 / 탭)를 자동 감지한다. 서버로 전송하지 않는다.

import Papa from "papaparse";

export type CsvEncoding = "utf-8" | "utf-8-bom" | "euc-kr" | "unknown";
export type CsvDelimiter = "," | "\t";

export interface ParsedFile {
  fileName: string;
  fileSize: number;
  encoding: CsvEncoding;
  delimiter: CsvDelimiter;
  headers: string[];
  rows: Record<string, string>[];
  rowCount: number;
}

// ArrayBuffer → 문자열 + 인코딩 판별
export function decodeBuffer(buf: ArrayBuffer): { text: string; encoding: CsvEncoding } {
  const bytes = new Uint8Array(buf);
  // UTF-8 BOM
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    const text = new TextDecoder("utf-8").decode(bytes.subarray(3));
    return { text, encoding: "utf-8-bom" };
  }
  // UTF-8 시도 (fatal:false → 깨지면 U+FFFD 등장)
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  if (!utf8.includes("�")) {
    return { text: utf8, encoding: "utf-8" };
  }
  // CP949/EUC-KR 시도
  try {
    const euckr = new TextDecoder("euc-kr").decode(bytes);
    return { text: euckr, encoding: "euc-kr" };
  } catch {
    return { text: utf8, encoding: "unknown" };
  }
}

export function detectDelimiter(text: string): CsvDelimiter {
  const firstLine = text.split(/\r?\n/).find((l) => l.trim().length > 0) ?? "";
  const tabs = (firstLine.match(/\t/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  return tabs > commas ? "\t" : ",";
}

// 문자열 → ParsedFile (테스트/재사용 가능한 순수 함수)
export function parseCsvText(
  text: string,
  meta: { fileName: string; fileSize: number; encoding?: CsvEncoding },
): ParsedFile {
  const delimiter = detectDelimiter(text);
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    delimiter,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.replace(/^﻿/, "").trim(),
  });
  const headers = (result.meta.fields ?? []).map((h) => h.trim());
  const rows = (result.data ?? []).filter((r) => r && Object.keys(r).length > 0);
  return {
    fileName: meta.fileName,
    fileSize: meta.fileSize,
    encoding: meta.encoding ?? "utf-8",
    delimiter,
    headers,
    rows,
    rowCount: rows.length,
  };
}

// File → ParsedFile (브라우저)
export async function parseFile(file: File): Promise<ParsedFile> {
  const buf = await file.arrayBuffer();
  const { text, encoding } = decodeBuffer(buf);
  const parsed = parseCsvText(text, { fileName: file.name, fileSize: file.size, encoding });
  return parsed;
}
