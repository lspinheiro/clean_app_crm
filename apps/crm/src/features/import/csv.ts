import {
  createClientSchema,
  createSiteSchema,
} from "@/features/clients/schema";

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

type ParsedCsv = { rows: string[][]; error: string | null };

function parseCsv(source: string): ParsedCsv {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

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
      rows.push(row);
      row = [];
      cell = "";
    } else if (character !== "\r") {
      cell += character;
    }
  }

  if (quoted) {
    return { rows: [], error: "The CSV contains an unclosed quoted field." };
  }

  row.push(cell);
  if (row.some((value) => value.length > 0) || rows.length === 0) {
    rows.push(row);
  }
  while (rows.at(-1)?.every((value) => value.trim().length === 0)) {
    rows.pop();
  }

  return { rows, error: null };
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

function firstReason(issues: { message: string }[]) {
  return issues[0]?.message ?? "Check this row and try again.";
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
): ImportPreview<ClientImportValues> {
  const parsedCsv = parseCsv(source);
  if (parsedCsv.error) return { fileError: parsedCsv.error, rows: [] };
  if (!headersMatch(parsedCsv.rows[0], clientHeaders)) {
    return {
      fileError:
        "Use the client template columns: name, contact_name, phone, notes.",
      rows: [],
    };
  }

  const existingByName = new Map(
    existingNames.map((name) => [normaliseName(name), name]),
  );
  const namesInFile = new Map<string, string>();
  const rows: ImportPreviewRow<ClientImportValues>[] = [];

  parsedCsv.rows.slice(1).forEach((cells, index) => {
    const values = clientValues(cells);
    const rowNumber = index + 2;
    if (cells.length !== clientHeaders.length) {
      rows.push({
        rowNumber,
        state: "invalid",
        values,
        reason: "Expected " + clientHeaders.length + " columns.",
      });
      return;
    }

    const validation = createClientSchema.safeParse(values);
    if (!validation.success) {
      rows.push({
        rowNumber,
        state: "invalid",
        values,
        reason: firstReason(validation.error.issues),
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
        state: "duplicate",
        values: cleanValues,
        reason: "A client named " + existingName + " already exists.",
      });
      return;
    }
    const earlierName = namesInFile.get(normalised);
    if (earlierName) {
      rows.push({
        rowNumber,
        state: "duplicate",
        values: cleanValues,
        reason: "A client named " + earlierName + " is already in this file.",
      });
      return;
    }

    namesInFile.set(normalised, cleanValues.name);
    rows.push({
      rowNumber,
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
): ImportPreview<SiteImportValues, SiteImportActionInput> {
  const parsedCsv = parseCsv(source);
  if (parsedCsv.error) return { fileError: parsedCsv.error, rows: [] };
  if (!headersMatch(parsedCsv.rows[0], siteHeaders)) {
    return {
      fileError:
        "Use the site template columns: client_name, name, address, suburb, access_notes.",
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

  parsedCsv.rows.slice(1).forEach((cells, index) => {
    const values = siteValues(cells);
    const rowNumber = index + 2;
    if (cells.length !== siteHeaders.length) {
      rows.push({
        rowNumber,
        state: "invalid",
        values,
        reason: "Expected " + siteHeaders.length + " columns.",
      });
      return;
    }
    if (!values.clientName) {
      rows.push({
        rowNumber,
        state: "invalid",
        values,
        reason: "Enter a client name.",
      });
      return;
    }

    const matchingClients =
      clientsByName.get(normaliseName(values.clientName)) ?? [];
    if (matchingClients.length === 0) {
      rows.push({
        rowNumber,
        state: "invalid",
        values,
        reason: "No client named " + values.clientName + " exists.",
      });
      return;
    }
    if (matchingClients.length > 1) {
      rows.push({
        rowNumber,
        state: "invalid",
        values,
        reason:
          "More than one client is named " +
          values.clientName +
          ". Rename the duplicate client first.",
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
        state: "invalid",
        values,
        reason: firstReason(validation.error.issues),
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
        state: "duplicate",
        values: cleanValues,
        reason: existingName + " already exists for " + client.name + ".",
      });
      return;
    }
    const earlierSiteName = sitesInFile.get(key);
    if (earlierSiteName) {
      rows.push({
        rowNumber,
        state: "duplicate",
        values: cleanValues,
        reason:
          earlierSiteName +
          " for " +
          client.name +
          " is already in this file.",
      });
      return;
    }

    sitesInFile.set(key, cleanValues.name);
    rows.push({
      rowNumber,
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
  rows: Array<ClientImportValues | SiteImportValues>,
): string {
  const output: string[][] = [];
  switch (entity) {
    case "clients":
      output.push([...clientHeaders]);
      for (const row of rows) {
        if ("clientName" in row) {
          throw new Error("A site row cannot be exported as a client row.");
        }
        output.push([row.name, row.contactName, row.phone, row.notes]);
      }
      break;
    case "sites":
      output.push([...siteHeaders]);
      for (const row of rows) {
        if (!("clientName" in row)) {
          throw new Error("A client row cannot be exported as a site row.");
        }
        output.push([
          row.clientName,
          row.name,
          row.address,
          row.suburb,
          row.accessNotes,
        ]);
      }
      break;
    default:
      assertNever(entity);
  }

  return output
    .map((cells) => cells.map(escapeCsv).join(","))
    .join("\r\n") + "\r\n";
}
