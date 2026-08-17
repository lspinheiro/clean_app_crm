"use client";

import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Upload,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { type ChangeEvent, useMemo, useRef, useState } from "react";

import {
  importClientRow,
  importSiteRow,
  type ImportRowActionResult,
} from "@/app/actions/import";
import {
  type ClientImportValues,
  type ExistingImportClient,
  type ImportCsvTranslator,
  type ImportPreview,
  type ImportPreviewRow,
  type SiteImportActionInput,
  type SiteImportValues,
  parseClientImportCsv,
  parseSiteImportCsv,
  serialiseImportRows,
} from "@/features/import/csv";
import { useRouter } from "@/i18n/navigation";
import { localiseUserMessage } from "@/i18n/user-message";

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
  sourceCells: string[];
  state: ResultState;
  values: TValues;
};

type ImportResults =
  | { entity: "clients"; rows: ImportResultRow<ClientImportValues>[] }
  | { entity: "sites"; rows: ImportResultRow<SiteImportValues>[] };

type Progress = { current: number; total: number } | null;

type ImportColumnDescriptionKey =
  | "commercialClientName"
  | "contactPhone"
  | "existingClientName"
  | "internalAccessNotes"
  | "internalNotes"
  | "primaryContact"
  | "siteName"
  | "streetAddress"
  | "suburb";

const clientColumns = [
  { name: "name", requirement: "required", description: "commercialClientName" },
  { name: "contact_name", requirement: "optional", description: "primaryContact" },
  { name: "phone", requirement: "optional", description: "contactPhone" },
  { name: "notes", requirement: "optional", description: "internalNotes" },
] as const;

const siteColumns = [
  { name: "client_name", requirement: "required", description: "existingClientName" },
  { name: "name", requirement: "required", description: "siteName" },
  { name: "address", requirement: "required", description: "streetAddress" },
  { name: "suburb", requirement: "required", description: "suburb" },
  { name: "access_notes", requirement: "optional", description: "internalAccessNotes" },
] as const;

function ColumnContract({
  label,
  columns,
}: {
  label: string;
  columns: readonly {
    name: string;
    requirement: "optional" | "required";
    description: ImportColumnDescriptionKey;
  }[];
}) {
  const t = useTranslations("Import");
  return (
    <section aria-label={label} className="import-column-contract">
      <dl>
        {columns.map((column) => (
          <div key={column.name}>
            <dt>
              <code>{column.name}</code>
              <span>{t(column.requirement)}</span>
            </dt>
            <dd>{t(column.description)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function statusLabel(
  state: ImportPreviewRow<unknown, unknown>["state"],
  t: ReturnType<typeof useTranslations<"Import">>,
) {
  switch (state) {
    case "ready":
      return t("ready");
    case "duplicate":
      return t("skipped");
    case "invalid":
      return t("failed");
  }
}

function resultLabel(state: ResultState, t: ReturnType<typeof useTranslations<"Import">>) {
  switch (state) {
    case "created":
      return t("created");
    case "skipped":
      return t("skipped");
    case "failed":
      return t("failed");
  }
}

function actionError(
  result: ImportRowActionResult,
  fallback: string,
  locale: ReturnType<typeof useLocale>,
) {
  return (
    localiseUserMessage(result.formError, locale) ??
    localiseUserMessage(Object.values(result.fieldErrors)[0], locale) ??
    fallback
  );
}

function PreviewTable({ state }: { state: PreviewState }) {
  const t = useTranslations("Import");
  const entityLabel = state.entity === "clients" ? t("client") : t("site");
  return (
    <div className="import-table-scroll">
      <table
        aria-label={state.entity === "clients" ? t("clientPreview") : t("sitePreview")}
        className="import-table"
      >
        <thead>
          <tr>
            <th scope="col">{t("row")}</th>
            <th scope="col">{t("status")}</th>
            <th scope="col">{entityLabel}</th>
            <th scope="col">{t("details")}</th>
            <th scope="col">{t("reason")}</th>
          </tr>
        </thead>
        <tbody>
          {state.preview.rows.map((row) => (
            <tr className={"import-row import-row--" + row.state} key={row.rowNumber}>
              <td className="tabular-numerals" data-label={t("row")}>{row.rowNumber}</td>
              <td data-label={t("status")}>
                <span className={"import-status import-status--" + row.state}>
                  {statusLabel(row.state, t)}
                </span>
              </td>
              <td data-label={entityLabel}>
                <strong>{row.values.name || t("missingName")}</strong>
                {"clientName" in row.values ? (
                  <span>{row.values.clientName || t("missingClient")}</span>
                ) : null}
              </td>
              <td data-label={t("details")}>
                {"clientName" in row.values
                  ? row.values.address && row.values.suburb
                    ? row.values.address + ", " + row.values.suburb
                    : t("addressIncomplete")
                  : row.values.contactName || row.values.phone || t("noOptionalDetails")}
              </td>
              <td data-label={t("reason")}>
                {row.state === "ready" ? t("readyToCreate") : row.reason}
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
  const t = useTranslations("Import");
  const counts = resultCounts(results.rows);
  const failedRows = results.rows.filter((row) => row.state === "failed");
  const csv = serialiseImportRows(
    results.entity,
    failedRows.map((row) => row.sourceCells),
  );
  const href =
    "data:text/csv;charset=utf-8," + encodeURIComponent(csv);

  return (
    <section
      aria-label={t("resultsAria")}
      aria-live="polite"
      className="import-results"
    >
      <div className="import-results__heading">
        <div>
          <CheckCircle2 aria-hidden="true" size={22} />
          <h2>{t("complete")}</h2>
        </div>
        {failedRows.length ? (
          <a
            className="button button--secondary button--small"
            download={"failed-" + results.entity + ".csv"}
            href={href}
          >
            <Download aria-hidden="true" size={17} />
            {t("downloadFailed", { count: failedRows.length })}
          </a>
        ) : null}
      </div>
      <div className="import-result-counts">
        <strong>{t("createdCount", { count: counts.created })}</strong>
        <strong>{t("skippedCount", { count: counts.skipped })}</strong>
        <strong>{t("failedCount", { count: counts.failed })}</strong>
      </div>
      <ul className="import-result-list">
        {results.rows.map((row) => (
          <li key={row.rowNumber}>
            <span className={"import-status import-status--" + row.state}>
              {resultLabel(row.state, t)}
            </span>
            <span>{t("rowResult", { row: row.rowNumber, name: row.values.name || t("missingName") })}</span>
            <span>{row.message}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ImportWorkspace({ clients }: { clients: ExistingImportClient[] }) {
  const locale = useLocale();
  const t = useTranslations("Import");
  const router = useRouter();
  const [entity, setEntity] = useState<"clients" | "sites">("clients");
  const [previewState, setPreviewState] = useState<PreviewState | null>(null);
  const [results, setResults] = useState<ImportResults | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<Progress>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileReadRequestRef = useRef(0);
  const readyCount = useMemo(
    () =>
      previewState?.preview.rows.filter((row) => row.state === "ready").length ??
      0,
    [previewState],
  );
  const translateCsv: ImportCsvTranslator = (key, values) => t(key, values);

  function chooseEntity(nextEntity: "clients" | "sites") {
    if (busy) return;
    fileReadRequestRef.current += 1;
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
    const requestId = fileReadRequestRef.current + 1;
    fileReadRequestRef.current = requestId;
    const targetEntity = entity;
    setResults(null);
    setProgress(null);
    let buffer: ArrayBuffer;
    try {
      buffer = await file.arrayBuffer();
    } catch {
      if (requestId !== fileReadRequestRef.current) return;
      setPreviewState({
        entity: targetEntity,
        fileName: file.name,
        preview: {
          fileError: t("readFailed"),
          rows: [],
        },
      });
      return;
    }
    if (requestId !== fileReadRequestRef.current) return;

    let source: string;
    try {
      source = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    } catch {
      setPreviewState({
        entity: targetEntity,
        fileName: file.name,
        preview: {
          fileError: t("notUtf8"),
          rows: [],
        },
      });
      return;
    }

    if (targetEntity === "clients") {
      setPreviewState({
        entity: targetEntity,
        fileName: file.name,
        preview: parseClientImportCsv(
          source,
          clients.map((client) => client.name),
          translateCsv,
          (message) => localiseUserMessage(message, locale) ?? message,
        ),
      });
    } else {
      setPreviewState({
        entity: targetEntity,
        fileName: file.name,
        preview: parseSiteImportCsv(
          source,
          clients,
          translateCsv,
          (message) => localiseUserMessage(message, locale) ?? message,
        ),
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
          sourceCells: row.sourceCells,
          values: row.values,
          state: "failed",
          message: row.reason,
        });
      } else if (row.state === "duplicate") {
        rows.push({
          rowNumber: row.rowNumber,
          sourceCells: row.sourceCells,
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
            sourceCells: row.sourceCells,
            values: row.values,
            state: result.ok ? "created" : "failed",
            message: result.ok
              ? t("clientCreated")
              : actionError(
                  result,
                  t("clientCreateFailed"),
                  locale,
                ),
          });
        } catch {
          rows.push({
            rowNumber: row.rowNumber,
            sourceCells: row.sourceCells,
            values: row.values,
            state: "failed",
            message: t("clientCreateFailed"),
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
          sourceCells: row.sourceCells,
          values: row.values,
          state: "failed",
          message: row.reason,
        });
      } else if (row.state === "duplicate") {
        rows.push({
          rowNumber: row.rowNumber,
          sourceCells: row.sourceCells,
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
            sourceCells: row.sourceCells,
            values: row.values,
            state: result.ok ? "created" : "failed",
            message: result.ok
              ? t("siteCreated")
              : actionError(
                  result,
                  t("siteCreateFailed"),
                  locale,
                ),
          });
        } catch {
          rows.push({
            rowNumber: row.rowNumber,
            sourceCells: row.sourceCells,
            values: row.values,
            state: "failed",
            message: t("siteCreateFailed"),
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

  return (
    <div className="import-workspace">
      <section className="import-templates">
        <div className="import-section-heading">
          <FileSpreadsheet aria-hidden="true" size={24} />
          <div>
            <h2>{t("templatesTitle")}</h2>
            <p>{t("templatesDescription")}</p>
          </div>
        </div>
        <div className="import-template-grid">
          <div className="import-template">
            <div className="import-template__heading">
              <h3>{t("clients")}</h3>
              <a download className="text-link" href="/templates/clients-import.csv">
                <Download aria-hidden="true" size={16} />
                {t("downloadClientTemplate")}
              </a>
            </div>
            <ColumnContract label={t("clientColumnsAria")} columns={clientColumns} />
          </div>
          <div className="import-template">
            <div className="import-template__heading">
              <h3>{t("sites")}</h3>
              <a download className="text-link" href="/templates/sites-import.csv">
                <Download aria-hidden="true" size={16} />
                {t("downloadSiteTemplate")}
              </a>
            </div>
            <ColumnContract label={t("siteColumnsAria")} columns={siteColumns} />
          </div>
        </div>
      </section>

      <section className="import-picker">
        <div className="import-section-heading">
          <Upload aria-hidden="true" size={24} />
          <div>
            <h2>{t("pickerTitle")}</h2>
            <p>{t("pickerDescription")}</p>
          </div>
        </div>
        <fieldset className="import-entity-picker" disabled={busy}>
          <legend>{t("recordType")}</legend>
          <label>
            <input
              checked={entity === "clients"}
              name="import-entity"
              onChange={() => chooseEntity("clients")}
              type="radio"
            />
            <span>{t("clients")}</span>
          </label>
          <label>
            <input
              checked={entity === "sites"}
              name="import-entity"
              onChange={() => chooseEntity("sites")}
              type="radio"
            />
            <span>{t("sites")}</span>
          </label>
        </fieldset>
        <div className="import-file-field">
          <label htmlFor={"import-file-" + entity}>
            {entity === "clients" ? t("clientCsvFile") : t("siteCsvFile")}
          </label>
          <input
            accept=".csv,text/csv"
            aria-label={entity === "clients" ? t("clientCsvFile") : t("siteCsvFile")}
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
            <span className="field-hint">{t("csvOnly")}</span>
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
          aria-label={t("previewAria")}
          className="import-preview"
        >
          <div className="import-preview__heading">
            <div>
              <h2>{t("previewTitle")}</h2>
              <p>{t("rowsFound", { count: previewState.preview.rows.length })}</p>
            </div>
            <button
              className="button"
              disabled={busy || readyCount === 0}
              onClick={confirmImport}
              type="button"
            >
              {busy ? t("importing") : t("confirm")}
            </button>
          </div>
          {previewState.preview.rows.length ? (
            <PreviewTable state={previewState} />
          ) : (
            <div className="import-empty">
              <FileSpreadsheet aria-hidden="true" size={24} />
              <p>{t("headerOnly")}</p>
            </div>
          )}
          {progress ? (
            <p aria-live="polite" className="import-progress" role="status">
              {t("progress", { current: progress.current, total: progress.total })}
            </p>
          ) : null}
        </section>
      ) : null}

      {results ? <ImportResultsPanel results={results} /> : null}
    </div>
  );
}
