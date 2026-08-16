"use client";

import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Upload,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { type ChangeEvent, useMemo, useRef, useState } from "react";

import {
  importClientRow,
  importSiteRow,
  type ImportRowActionResult,
} from "@/app/actions/import";
import {
  type ClientImportValues,
  type ExistingImportClient,
  type ImportPreview,
  type ImportPreviewRow,
  type SiteImportActionInput,
  type SiteImportValues,
  parseClientImportCsv,
  parseSiteImportCsv,
  serialiseImportRows,
} from "@/features/import/csv";

type PreviewState =
  | {
      entity: "clients";
      fileName: string;
      preview: ImportPreview<ClientImportValues>;
    }
  | {
      entity: "sites";
      fileName: string;
      preview: ImportPreview<SiteImportValues, SiteImportActionInput>;
    };

type ResultState = "created" | "skipped" | "failed";

type ImportResultRow<TValues> = {
  message: string;
  rowNumber: number;
  state: ResultState;
  values: TValues;
};

type ImportResults =
  | { entity: "clients"; rows: ImportResultRow<ClientImportValues>[] }
  | { entity: "sites"; rows: ImportResultRow<SiteImportValues>[] };

type Progress = { current: number; total: number } | null;

const clientColumns = [
  { name: "name", requirement: "Required", description: "Commercial client name" },
  { name: "contact_name", requirement: "Optional", description: "Primary contact person" },
  { name: "phone", requirement: "Optional", description: "Contact phone number" },
  { name: "notes", requirement: "Optional", description: "Internal notes" },
] as const;

const siteColumns = [
  { name: "client_name", requirement: "Required", description: "Existing client name" },
  { name: "name", requirement: "Required", description: "Site name" },
  { name: "address", requirement: "Required", description: "Street address" },
  { name: "suburb", requirement: "Required", description: "Suburb" },
  { name: "access_notes", requirement: "Optional", description: "Internal access notes" },
] as const;

function ColumnContract({
  label,
  columns,
}: {
  label: string;
  columns: readonly {
    name: string;
    requirement: string;
    description: string;
  }[];
}) {
  return (
    <section aria-label={label} className="import-column-contract">
      <dl>
        {columns.map((column) => (
          <div key={column.name}>
            <dt>
              <code>{column.name}</code>
              <span>{column.requirement}</span>
            </dt>
            <dd>{column.description}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function statusLabel(state: ImportPreviewRow<unknown, unknown>["state"]) {
  switch (state) {
    case "ready":
      return "Ready";
    case "duplicate":
      return "Skipped";
    case "invalid":
      return "Failed";
  }
}

function resultLabel(state: ResultState) {
  switch (state) {
    case "created":
      return "Created";
    case "skipped":
      return "Skipped";
    case "failed":
      return "Failed";
  }
}

function actionError(result: ImportRowActionResult, fallback: string) {
  return (
    result.formError ??
    Object.values(result.fieldErrors)[0] ??
    fallback
  );
}

function PreviewTable({ state }: { state: PreviewState }) {
  const entityLabel = state.entity === "clients" ? "Client" : "Site";
  return (
    <div className="import-table-scroll">
      <table aria-label={entityLabel + " import preview"} className="import-table">
        <thead>
          <tr>
            <th scope="col">Row</th>
            <th scope="col">Status</th>
            <th scope="col">{entityLabel}</th>
            <th scope="col">Details</th>
            <th scope="col">Reason</th>
          </tr>
        </thead>
        <tbody>
          {state.preview.rows.map((row) => (
            <tr className={"import-row import-row--" + row.state} key={row.rowNumber}>
              <td className="tabular-numerals" data-label="Row">{row.rowNumber}</td>
              <td data-label="Status">
                <span className={"import-status import-status--" + row.state}>
                  {statusLabel(row.state)}
                </span>
              </td>
              <td data-label={entityLabel}>
                <strong>{row.values.name || "Missing name"}</strong>
                {"clientName" in row.values ? (
                  <span>{row.values.clientName || "Missing client"}</span>
                ) : null}
              </td>
              <td data-label="Details">
                {"clientName" in row.values
                  ? row.values.address && row.values.suburb
                    ? row.values.address + ", " + row.values.suburb
                    : "Address incomplete"
                  : row.values.contactName || row.values.phone || "No optional details"}
              </td>
              <td data-label="Reason">
                {row.state === "ready" ? "Ready to create" : row.reason}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function resultCounts(rows: ImportResultRow<unknown>[]) {
  return {
    created: rows.filter((row) => row.state === "created").length,
    failed: rows.filter((row) => row.state === "failed").length,
    skipped: rows.filter((row) => row.state === "skipped").length,
  };
}

function ImportResultsPanel({ results }: { results: ImportResults }) {
  const counts = resultCounts(results.rows);
  const failedRows = results.rows.filter((row) => row.state === "failed");
  const csv =
    results.entity === "clients"
      ? serialiseImportRows(
          "clients",
          failedRows.map((row) => row.values),
        )
      : serialiseImportRows(
          "sites",
          failedRows.map((row) => row.values),
        );
  const href =
    "data:text/csv;charset=utf-8," + encodeURIComponent(csv);

  return (
    <section
      aria-label="Import results"
      aria-live="polite"
      className="import-results"
    >
      <div className="import-results__heading">
        <div>
          <CheckCircle2 aria-hidden="true" size={22} />
          <h2>Import complete</h2>
        </div>
        {failedRows.length ? (
          <a
            className="button button--secondary button--small"
            download={"failed-" + results.entity + ".csv"}
            href={href}
          >
            <Download aria-hidden="true" size={17} />
            Download {failedRows.length} failed {failedRows.length === 1 ? "row" : "rows"}
          </a>
        ) : null}
      </div>
      <div className="import-result-counts">
        <strong>{counts.created} created</strong>
        <strong>{counts.skipped} skipped</strong>
        <strong>{counts.failed} failed</strong>
      </div>
      <ul className="import-result-list">
        {results.rows.map((row) => (
          <li key={row.rowNumber}>
            <span className={"import-status import-status--" + row.state}>
              {resultLabel(row.state)}
            </span>
            <span>Row {row.rowNumber}: {row.values.name || "Missing name"}</span>
            <span>{row.message}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ImportWorkspace({ clients }: { clients: ExistingImportClient[] }) {
  const router = useRouter();
  const [entity, setEntity] = useState<"clients" | "sites">("clients");
  const [previewState, setPreviewState] = useState<PreviewState | null>(null);
  const [results, setResults] = useState<ImportResults | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<Progress>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const readyCount = useMemo(
    () =>
      previewState?.preview.rows.filter((row) => row.state === "ready").length ??
      0,
    [previewState],
  );

  function chooseEntity(nextEntity: "clients" | "sites") {
    if (busy) return;
    setEntity(nextEntity);
    setPreviewState(null);
    setResults(null);
    setProgress(null);
  }

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    if (busy) return;
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    setResults(null);
    setProgress(null);
    try {
      const source = await file.text();
      if (entity === "clients") {
        setPreviewState({
          entity,
          fileName: file.name,
          preview: parseClientImportCsv(
            source,
            clients.map((client) => client.name),
          ),
        });
      } else {
        setPreviewState({
          entity,
          fileName: file.name,
          preview: parseSiteImportCsv(source, clients),
        });
      }
    } catch {
      setPreviewState({
        entity,
        fileName: file.name,
        preview: {
          fileError: "The CSV could not be read. Choose the file again.",
          rows: [],
        },
      });
    }
  }

  async function importClients(
    preview: ImportPreview<ClientImportValues>,
  ): Promise<ImportResultRow<ClientImportValues>[]> {
    const rows: ImportResultRow<ClientImportValues>[] = [];
    let current = 0;
    const total = preview.rows.filter((row) => row.state === "ready").length;
    for (const row of preview.rows) {
      if (row.state === "invalid") {
        rows.push({
          rowNumber: row.rowNumber,
          values: row.values,
          state: "failed",
          message: row.reason,
        });
      } else if (row.state === "duplicate") {
        rows.push({
          rowNumber: row.rowNumber,
          values: row.values,
          state: "skipped",
          message: row.reason,
        });
      } else {
        current += 1;
        setProgress({ current, total });
        try {
          const result = await importClientRow(row.actionInput);
          rows.push({
            rowNumber: row.rowNumber,
            values: row.values,
            state: result.ok ? "created" : "failed",
            message: result.ok
              ? "Client created."
              : actionError(
                  result,
                  "The client could not be created. Please try again.",
                ),
          });
        } catch {
          rows.push({
            rowNumber: row.rowNumber,
            values: row.values,
            state: "failed",
            message: "The client could not be created. Please try again.",
          });
        }
      }
    }
    return rows;
  }

  async function importSites(
    preview: ImportPreview<SiteImportValues, SiteImportActionInput>,
  ): Promise<ImportResultRow<SiteImportValues>[]> {
    const rows: ImportResultRow<SiteImportValues>[] = [];
    let current = 0;
    const total = preview.rows.filter((row) => row.state === "ready").length;
    for (const row of preview.rows) {
      if (row.state === "invalid") {
        rows.push({
          rowNumber: row.rowNumber,
          values: row.values,
          state: "failed",
          message: row.reason,
        });
      } else if (row.state === "duplicate") {
        rows.push({
          rowNumber: row.rowNumber,
          values: row.values,
          state: "skipped",
          message: row.reason,
        });
      } else {
        current += 1;
        setProgress({ current, total });
        try {
          const result = await importSiteRow(row.actionInput);
          rows.push({
            rowNumber: row.rowNumber,
            values: row.values,
            state: result.ok ? "created" : "failed",
            message: result.ok
              ? "Site created."
              : actionError(
                  result,
                  "The site could not be created. Please try again.",
                ),
          });
        } catch {
          rows.push({
            rowNumber: row.rowNumber,
            values: row.values,
            state: "failed",
            message: "The site could not be created. Please try again.",
          });
        }
      }
    }
    return rows;
  }

  async function confirmImport() {
    if (!previewState || readyCount === 0 || busy) return;
    setBusy(true);
    setResults(null);
    try {
      if (previewState.entity === "clients") {
        const rows = await importClients(previewState.preview);
        setResults({ entity: "clients", rows });
        setPreviewState(null);
        if (rows.some((row) => row.state === "created")) router.refresh();
      } else {
        const rows = await importSites(previewState.preview);
        setResults({ entity: "sites", rows });
        setPreviewState(null);
        if (rows.some((row) => row.state === "created")) router.refresh();
      }
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
      setBusy(false);
      setProgress(null);
    }
  }

  const entityLabel = entity === "clients" ? "Client" : "Site";

  return (
    <div className="import-workspace">
      <section className="import-templates">
        <div className="import-section-heading">
          <FileSpreadsheet aria-hidden="true" size={24} />
          <div>
            <h2>Start from the published columns</h2>
            <p>Keep the header row unchanged. Optional cells may be blank.</p>
          </div>
        </div>
        <div className="import-template-grid">
          <div className="import-template">
            <div className="import-template__heading">
              <h3>Clients</h3>
              <a download className="text-link" href="/templates/clients-import.csv">
                <Download aria-hidden="true" size={16} />
                Download client template
              </a>
            </div>
            <ColumnContract label="Client CSV columns" columns={clientColumns} />
          </div>
          <div className="import-template">
            <div className="import-template__heading">
              <h3>Sites</h3>
              <a download className="text-link" href="/templates/sites-import.csv">
                <Download aria-hidden="true" size={16} />
                Download site template
              </a>
            </div>
            <ColumnContract label="Site CSV columns" columns={siteColumns} />
          </div>
        </div>
      </section>

      <section className="import-picker">
        <div className="import-section-heading">
          <Upload aria-hidden="true" size={24} />
          <div>
            <h2>Choose records to import</h2>
            <p>Import clients first when the site file names a new client.</p>
          </div>
        </div>
        <fieldset className="import-entity-picker" disabled={busy}>
          <legend>Record type</legend>
          <label>
            <input
              checked={entity === "clients"}
              name="import-entity"
              onChange={() => chooseEntity("clients")}
              type="radio"
            />
            <span>Clients</span>
          </label>
          <label>
            <input
              checked={entity === "sites"}
              name="import-entity"
              onChange={() => chooseEntity("sites")}
              type="radio"
            />
            <span>Sites</span>
          </label>
        </fieldset>
        <div className="import-file-field">
          <label htmlFor={"import-file-" + entity}>
            {entityLabel} CSV file
          </label>
          <input
            accept=".csv,text/csv"
            aria-label={entityLabel + " CSV file"}
            disabled={busy}
            id={"import-file-" + entity}
            key={entity}
            onChange={chooseFile}
            ref={fileInputRef}
            type="file"
          />
          {previewState ? (
            <span className="field-hint">{previewState.fileName}</span>
          ) : (
            <span className="field-hint">CSV files only</span>
          )}
        </div>
      </section>

      {previewState?.preview.fileError ? (
        <p className="form-error import-file-error" role="alert">
          <AlertCircle aria-hidden="true" size={18} />
          {previewState.preview.fileError}
        </p>
      ) : null}

      {previewState && !previewState.preview.fileError ? (
        <section
          aria-busy={busy}
          aria-label="Import preview"
          className="import-preview"
        >
          <div className="import-preview__heading">
            <div>
              <h2>Check the preview</h2>
              <p>
                {previewState.preview.rows.length}{" "}
                {previewState.preview.rows.length === 1 ? "row" : "rows"} found.
                Nothing is written until you confirm.
              </p>
            </div>
            <button
              className="button"
              disabled={busy || readyCount === 0}
              onClick={confirmImport}
              type="button"
            >
              {busy ? "Importing…" : "Confirm import"}
            </button>
          </div>
          {previewState.preview.rows.length ? (
            <PreviewTable state={previewState} />
          ) : (
            <div className="import-empty">
              <FileSpreadsheet aria-hidden="true" size={24} />
              <p>The file has a header but no records.</p>
            </div>
          )}
          {progress ? (
            <p aria-live="polite" className="import-progress" role="status">
              Importing {progress.current} of {progress.total}
            </p>
          ) : null}
        </section>
      ) : null}

      {results ? <ImportResultsPanel results={results} /> : null}
    </div>
  );
}
