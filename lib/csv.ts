/**
 * Tiny RFC 4180 CSV parser — no dependencies, good enough for the bulk
 * lesson import. Handles quoted fields, embedded commas and newlines.
 *
 * Returns an array of objects keyed by the header row. Empty lines are
 * skipped. A missing column is `undefined` rather than `""` so the caller
 * can distinguish "explicitly empty" from "not provided".
 */
export function parseCsv(text: string): Record<string, string | undefined>[] {
  const lines = splitCsvLines(text);
  if (lines.length === 0) return [];

  const headers = parseCsvLine(lines[0]);
  const rows: Record<string, string | undefined>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    if (values.every((v) => v === "")) continue; // skip blank lines
    const row: Record<string, string | undefined> = {};
    headers.forEach((header, idx) => {
      const val = values[idx];
      row[header] = val === "" ? undefined : val;
    });
    rows.push(row);
  }

  return rows;
}

/** Splits CSV text into logical lines, respecting quoted newlines. */
function splitCsvLines(text: string): string[] {
  const lines: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "\n" && !inQuotes) {
      lines.push(current);
      current = "";
    } else if (ch === "\r" && next === "\n") {
      // Skip \r in \r\n — we'll hit the \n next
    } else {
      current += ch;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** Parses a single CSV line into fields, respecting quotes. */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const next = line[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}
