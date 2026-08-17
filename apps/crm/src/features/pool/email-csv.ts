import { z } from "zod";

export type PoolInviteEmailRecipient = {
  email: string;
  name: string | null;
};

export type PoolInviteEmailCsvRow = PoolInviteEmailRecipient & {
  reason: string | null;
  rowNumber: number;
  status: "ready" | "duplicate" | "invalid";
};

export type PoolInviteEmailCsvPreview = {
  fileError: string | null;
  recipients: PoolInviteEmailRecipient[];
  rows: PoolInviteEmailCsvRow[];
};

const headers = ["email", "name"] as const;
const emailSchema = z.email().max(320);

export type PoolInviteEmailCsvMessageKey =
  | "addRecipient"
  | "duplicateEmail"
  | "exactHeaders"
  | "expectedColumns"
  | "unclosedQuote"
  | "validEmail";

export type PoolInviteEmailCsvTranslator = (
  key: PoolInviteEmailCsvMessageKey,
) => string;

type ParsedRow = { cells: string[]; rowNumber: number };

function message(
  translate: PoolInviteEmailCsvTranslator | undefined,
  key: PoolInviteEmailCsvMessageKey,
) {
  if (translate) return translate(key);
  switch (key) {
    case "addRecipient": return "Add at least one recipient.";
    case "duplicateEmail": return "This email address is already in the file.";
    case "exactHeaders": return "Use the exact headers: email,name.";
    case "expectedColumns": return "Expected 2 columns.";
    case "unclosedQuote": return "The CSV contains an unclosed quoted field.";
    case "validEmail": return "Enter a valid email address.";
  }
}

function parseCsv(
  source: string,
  translate?: PoolInviteEmailCsvTranslator,
): { error: string | null; rows: ParsedRow[] } {
  const rows: ParsedRow[] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let rowNumber = 1;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += character;
      }
      continue;
    }

    if (character === '"' && cell.length === 0) {
      quoted = true;
    } else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\n") {
      row.push(cell);
      rows.push({ cells: row, rowNumber });
      row = [];
      cell = "";
      rowNumber += 1;
    } else if (character !== "\r") {
      cell += character;
    }
  }

  if (quoted) return { error: message(translate, "unclosedQuote"), rows: [] };

  row.push(cell);
  if (row.some((value) => value.length > 0) || rows.length === 0) {
    rows.push({ cells: row, rowNumber });
  }

  return {
    error: null,
    rows: rows.filter(({ cells }) => cells.some((value) => value.trim().length > 0)),
  };
}

function hasExpectedHeaders(cells: string[] | undefined) {
  if (!cells || cells.length !== headers.length) return false;
  return headers.every(
    (header, index) => cells[index]?.replace(/^\ufeff/, "").trim() === header,
  );
}

export function parsePoolInviteEmailCsv(
  source: string,
  translate?: PoolInviteEmailCsvTranslator,
): PoolInviteEmailCsvPreview {
  const parsed = parseCsv(source, translate);
  if (parsed.error) return { fileError: parsed.error, recipients: [], rows: [] };
  if (!hasExpectedHeaders(parsed.rows[0]?.cells)) {
    return {
      fileError: message(translate, "exactHeaders"),
      recipients: [],
      rows: [],
    };
  }

  const recipients: PoolInviteEmailRecipient[] = [];
  const rows: PoolInviteEmailCsvRow[] = [];
  const seen = new Set<string>();

  for (const { cells, rowNumber } of parsed.rows.slice(1)) {
    const email = (cells[0] ?? "").trim().toLocaleLowerCase("en-AU");
    const trimmedName = (cells[1] ?? "").trim();
    const name = trimmedName || null;

    if (cells.length !== headers.length) {
      rows.push({
        email,
        name,
        reason: message(translate, "expectedColumns"),
        rowNumber,
        status: "invalid",
      });
      continue;
    }

    if (!emailSchema.safeParse(email).success) {
      rows.push({
        email,
        name,
        reason: message(translate, "validEmail"),
        rowNumber,
        status: "invalid",
      });
      continue;
    }

    if (seen.has(email)) {
      rows.push({
        email,
        name,
        reason: message(translate, "duplicateEmail"),
        rowNumber,
        status: "duplicate",
      });
      continue;
    }

    seen.add(email);
    const recipient = { email, name };
    recipients.push(recipient);
    rows.push({ ...recipient, reason: null, rowNumber, status: "ready" });
  }

  if (rows.length === 0) {
    return { fileError: message(translate, "addRecipient"), recipients: [], rows: [] };
  }

  return { fileError: null, recipients, rows };
}
