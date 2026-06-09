export type ParsedMenuCsvRow = {
  section: string;
  name: string;
  description: string | null;
  priceLabel: string | null;
  dietaryTags: string[];
  allergens: string[];
  available: boolean;
};

export type InvalidMenuCsvRow = {
  rowNumber: number;
  reason: string;
};

export function parseMenuCsv(csv: string): { rows: ParsedMenuCsvRow[]; invalidRows: InvalidMenuCsvRow[] } {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (!lines.length) {
    return { rows: [], invalidRows: [{ rowNumber: 1, reason: "CSV header is required" }] };
  }

  const headers = splitCsvLine(lines[0] ?? "").map((header) => normalizeHeader(header));
  const rows: ParsedMenuCsvRow[] = [];
  const invalidRows: InvalidMenuCsvRow[] = [];

  for (let index = 1; index < lines.length; index += 1) {
    const values = splitCsvLine(lines[index] ?? "");
    const record = Object.fromEntries(headers.map((header, valueIndex) => [header, values[valueIndex]?.trim() ?? ""]));
    const section = record.section?.trim() ?? "";
    const name = record.name?.trim() ?? "";

    if (!section || !name) {
      invalidRows.push({ rowNumber: index + 1, reason: "section and name are required" });
      continue;
    }

    rows.push({
      section,
      name,
      description: nullableText(record.description),
      priceLabel: nullableText(record.price || record.price_label),
      dietaryTags: splitList(record.dietary_tags),
      allergens: splitList(record.allergens),
      available: parseAvailable(record.available)
    });
  }

  return { rows, invalidRows };
}

function normalizeHeader(header: string) {
  return header.trim().toLowerCase().replace(/\s+/g, "_");
}

function nullableText(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed || null;
}

function splitList(value: string | undefined) {
  return (value ?? "")
    .split(/[|,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseAvailable(value: string | undefined) {
  const normalized = (value ?? "").trim().toLowerCase();
  if (["false", "no", "0"].includes(normalized)) {
    return false;
  }
  return true;
}

function splitCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === "," && !quoted) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}
