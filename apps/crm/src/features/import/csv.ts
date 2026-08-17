import {
  createClientSchema,
  createSiteSchema,
} from "@/features/clients/schema";
import { userMessage } from "@/i18n/user-message";

export type ImportEntity = "clients" | "sites";

export type ClientImportValues = {
  name: string;
  contactName: string;
  phone: string;
  notes: string;
};

export type SiteImportValues = {
  clientName: string;
  name: string;
  address: string;
  suburb: string;
  accessNotes: string;
};

export type SiteImportActionInput = Omit<SiteImportValues, "clientName"> & {
  clientId: string;
};

export type ExistingImportClient = {
  id: string;
  name: string;
  siteNames: string[];
};

export type ImportPreviewRow<TValues, TActionInput = TValues> = {
  rowNumber: number;
  sourceCells: string[];
  values: TValues;
} & (
  | { state: "ready"; actionInput: TActionInput }
  | { state: "duplicate"; reason: string }
  | { state: "invalid"; reason: string }
);

export type ImportPreview<TValues, TActionInput = TValues> = {
  fileError: string | null;
  rows: ImportPreviewRow<TValues, TActionInput>[];
};

const clientHeaders = ["name", "contact_name", "phone", "notes"] as const;
const siteHeaders = [
  "client_name",
  "name",
  "address",
  "suburb",
  "access_notes",
] as const;

type ParsedCsvRow = { cells: string[]; rowNumber: number };
type ParsedCsv = { rows: ParsedCsvRow[]; error: string | null };

export type ImportCsvMessageKey =
  | "ambiguousClient"
  | "clientAlreadyExists"
  | "clientAlreadyInFile"
  | "clientDoesNotExist"
  | "clientTemplateColumns"
  | "enterClientName"
  | "expectedColumns"
  | "siteAlreadyExists"
  | "siteAlreadyInFile"
  | "siteTemplateColumns"
  | "unclosedQuote";

export type ImportCsvTranslator = (
  key: ImportCsvMessageKey,
  values?: Record<string, number | string>,
) => string;

function importMessage(
  translate: ImportCsvTranslator | undefined,
  key: ImportCsvMessageKey,
  values: Record<string, number | string> = {},
) {
  if (translate) return translate(key, values);
  switch (key) {
    case "unclosedQuote":
      return "The CSV contains an unclosed quoted field.";
    case "clientTemplateColumns":
      return "Use the client template columns: name, contact_name, phone, notes.";
    case "siteTemplateColumns":
      return "Use the site template columns: client_name, name, address, suburb, access_notes.";
    case "expectedColumns":
      return `Expected ${values.count} columns.`;
    case "enterClientName":
      return "Enter a client name.";
    case "clientAlreadyExists":
      return `A client named ${values.clientName} already exists.`;
    case "clientAlreadyInFile":
      return `A client named ${values.clientName} is already in this file.`;
    case "clientDoesNotExist":
      return `No client named ${values.clientName} exists.`;
    case "ambiguousClient":
      return `More than one client is named ${values.clientName}. Rename the duplicate client first.`;
    case "siteAlreadyExists":
      return `${values.siteName} already exists for ${values.clientName}.`;
    case "siteAlreadyInFile":
      return `${values.siteName} for ${values.clientName} is already in this file.`;
  }
}

function parseCsv(source: string, translate?: ImportCsvTranslator): ParsedCsv {
  const rows: ParsedCsvRow[] = [];
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

  if (quoted) {
    return { rows: [], error: importMessage(translate, "unclosedQuote") };
  }

  row.push(cell);
  if (row.some((value) => value.length > 0) || rows.length === 0) {
    rows.push({ cells: row, rowNumber });
  }

  return {
    rows: rows.filter(({ cells }) =>
      cells.some((value) => value.trim().length > 0),
    ),
    error: null,
  };
}

function headersMatch(actual: string[] | undefined, expected: readonly string[]) {
  if (!actual || actual.length !== expected.length) return false;
  return expected.every(
    (header, index) =>
      actual[index]?.replace(/^\ufeff/, "").trim() === header,
  );
}

function normaliseName(value: string) {
  return value.trim().toLocaleLowerCase("en-AU");
}

function firstReason(
  issues: { message: string }[],
  localiseValidation: (message: string) => string,
) {
  return localiseValidation(
    issues[0]?.message ?? userMessage("checkRow"),
  );
}

function clientValues(cells: string[]): ClientImportValues {
  return {
    name: cells[0]?.trim() ?? "",
    contactName: cells[1]?.trim() ?? "",
    phone: cells[2]?.trim() ?? "",
    notes: cells[3]?.trim() ?? "",
  };
}

function siteValues(cells: string[]): SiteImportValues {
  return {
    clientName: cells[0]?.trim() ?? "",
    name: cells[1]?.trim() ?? "",
    address: cells[2]?.trim() ?? "",
    suburb: cells[3]?.trim() ?? "",
    accessNotes: cells[4]?.trim() ?? "",
  };
}

export function parseClientImportCsv(
  source: string,
  existingNames: string[],
  translate?: ImportCsvTranslator,
  localiseValidation: (message: string) => string = (message) => message,
): ImportPreview<ClientImportValues> {
  const parsedCsv = parseCsv(source, translate);
  if (parsedCsv.error) return { fileError: parsedCsv.error, rows: [] };
  if (!headersMatch(parsedCsv.rows[0]?.cells, clientHeaders)) {
    return {
      fileError: importMessage(translate, "clientTemplateColumns"),
      rows: [],
    };
  }

  const existingByName = new Map(
    existingNames.map((name) => [normaliseName(name), name]),
  );
  const namesInFile = new Map<string, string>();
  const rows: ImportPreviewRow<ClientImportValues>[] = [];

  parsedCsv.rows.slice(1).forEach(({ cells, rowNumber }) => {
    const values = clientValues(cells);
    if (cells.length !== clientHeaders.length) {
      rows.push({
        rowNumber,
        sourceCells: [...cells],
        state: "invalid",
        values,
        reason: importMessage(translate, "expectedColumns", {
          count: clientHeaders.length,
        }),
      });
      return;
    }

    const validation = createClientSchema.safeParse(values);
    if (!validation.success) {
      rows.push({
        rowNumber,
        sourceCells: [...cells],
        state: "invalid",
        values,
        reason: firstReason(validation.error.issues, localiseValidation),
      });
      return;
    }

    const cleanValues = {
      name: validation.data.name,
      contactName: validation.data.contactName ?? "",
      phone: validation.data.phone ?? "",
      notes: validation.data.notes ?? "",
    };
    const normalised = normaliseName(cleanValues.name);
    const existingName = existingByName.get(normalised);
    if (existingName) {
      rows.push({
        rowNumber,
        sourceCells: [...cells],
        state: "duplicate",
        values: cleanValues,
        reason: importMessage(translate, "clientAlreadyExists", {
          clientName: existingName,
        }),
      });
      return;
    }
    const earlierName = namesInFile.get(normalised);
    if (earlierName) {
      rows.push({
        rowNumber,
        sourceCells: [...cells],
        state: "duplicate",
        values: cleanValues,
        reason: importMessage(translate, "clientAlreadyInFile", {
          clientName: earlierName,
        }),
      });
      return;
    }

    namesInFile.set(normalised, cleanValues.name);
    rows.push({
      rowNumber,
      sourceCells: [...cells],
      state: "ready",
      values: cleanValues,
      actionInput: cleanValues,
    });
  });

  return { fileError: null, rows };
}

export function parseSiteImportCsv(
  source: string,
  clients: ExistingImportClient[],
  translate?: ImportCsvTranslator,
  localiseValidation: (message: string) => string = (message) => message,
): ImportPreview<SiteImportValues, SiteImportActionInput> {
  const parsedCsv = parseCsv(source, translate);
  if (parsedCsv.error) return { fileError: parsedCsv.error, rows: [] };
  if (!headersMatch(parsedCsv.rows[0]?.cells, siteHeaders)) {
    return {
      fileError: importMessage(translate, "siteTemplateColumns"),
      rows: [],
    };
  }

  const clientsByName = new Map<string, ExistingImportClient[]>();
  for (const client of clients) {
    const key = normaliseName(client.name);
    clientsByName.set(key, [...(clientsByName.get(key) ?? []), client]);
  }
  const sitesInFile = new Map<string, string>();
  const rows: ImportPreviewRow<SiteImportValues, SiteImportActionInput>[] = [];

  parsedCsv.rows.slice(1).forEach(({ cells, rowNumber }) => {
    const values = siteValues(cells);
    if (cells.length !== siteHeaders.length) {
      rows.push({
        rowNumber,
        sourceCells: [...cells],
        state: "invalid",
        values,
        reason: importMessage(translate, "expectedColumns", {
          count: siteHeaders.length,
        }),
      });
      return;
    }
    if (!values.clientName) {
      rows.push({
        rowNumber,
        sourceCells: [...cells],
        state: "invalid",
        values,
        reason: importMessage(translate, "enterClientName"),
      });
      return;
    }

    const matchingClients =
      clientsByName.get(normaliseName(values.clientName)) ?? [];
    if (matchingClients.length === 0) {
      rows.push({
        rowNumber,
        sourceCells: [...cells],
        state: "invalid",
        values,
        reason: importMessage(translate, "clientDoesNotExist", {
          clientName: values.clientName,
        }),
      });
      return;
    }
    if (matchingClients.length > 1) {
      rows.push({
        rowNumber,
        sourceCells: [...cells],
        state: "invalid",
        values,
        reason: importMessage(translate, "ambiguousClient", {
          clientName: values.clientName,
        }),
      });
      return;
    }

    const client = matchingClients[0];
    const validation = createSiteSchema.safeParse({
      clientId: client.id,
      name: values.name,
      address: values.address,
      suburb: values.suburb,
      accessNotes: values.accessNotes,
    });
    if (!validation.success) {
      rows.push({
        rowNumber,
        sourceCells: [...cells],
        state: "invalid",
        values,
        reason: firstReason(validation.error.issues, localiseValidation),
      });
      return;
    }

    const cleanValues = {
      clientName: client.name,
      name: validation.data.name,
      address: validation.data.address,
      suburb: validation.data.suburb,
      accessNotes: validation.data.accessNotes ?? "",
    };
    const siteName = normaliseName(cleanValues.name);
    const existingName = client.siteNames.find(
      (name) => normaliseName(name) === siteName,
    );
    const key = client.id + ":" + siteName;
    if (existingName) {
      rows.push({
        rowNumber,
        sourceCells: [...cells],
        state: "duplicate",
        values: cleanValues,
        reason: importMessage(translate, "siteAlreadyExists", {
          clientName: client.name,
          siteName: existingName,
        }),
      });
      return;
    }
    const earlierSiteName = sitesInFile.get(key);
    if (earlierSiteName) {
      rows.push({
        rowNumber,
        sourceCells: [...cells],
        state: "duplicate",
        values: cleanValues,
        reason: importMessage(translate, "siteAlreadyInFile", {
          clientName: client.name,
          siteName: earlierSiteName,
        }),
      });
      return;
    }

    sitesInFile.set(key, cleanValues.name);
    rows.push({
      rowNumber,
      sourceCells: [...cells],
      state: "ready",
      values: cleanValues,
      actionInput: {
        clientId: client.id,
        name: validation.data.name,
        address: validation.data.address,
        suburb: validation.data.suburb,
        accessNotes: validation.data.accessNotes ?? "",
      },
    });
  });

  return { fileError: null, rows };
}

function escapeCsv(value: string) {
  if (!/[",\r\n]/.test(value)) return value;
  return '"' + value.replaceAll('"', '""') + '"';
}

function assertNever(value: never): never {
  throw new Error("Unsupported import entity: " + String(value));
}

export function serialiseImportRows(
  entity: ImportEntity,
  rows: string[][],
): string {
  let headers: readonly string[];
  switch (entity) {
    case "clients":
      headers = clientHeaders;
      break;
    case "sites":
      headers = siteHeaders;
      break;
    default:
      assertNever(entity);
  }

  return [[...headers], ...rows]
    .map((cells) => cells.map(escapeCsv).join(","))
    .join("\r\n") + "\r\n";
}
