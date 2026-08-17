"use client";

import { Building2, FileUp, MapPin, Plus, Search, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { type FormEvent, useMemo, useRef, useState } from "react";

import {
  createClient,
  createSite,
  type RecordMutationResult,
} from "@/app/actions/clients";
import { filterClients } from "@/features/clients/filter";
import type { ClientWithSites } from "@/features/clients/types";
import { formatSiteDefaults } from "@/features/site-defaults/format";
import type { AppLocale } from "@/i18n/config";
import { Link, useRouter } from "@/i18n/navigation";
import { localiseMutationResult } from "@/i18n/user-message";

const emptyResult: RecordMutationResult = {
  ok: false,
  fieldErrors: {},
  formError: null,
};

type ClientsWorkspaceProps = {
  clients: ClientWithSites[];
};

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <span className="field-error" id={id} role="alert">
      {message}
    </span>
  ) : null;
}

export function ClientsWorkspace({ clients }: ClientsWorkspaceProps) {
  const locale = useLocale() as AppLocale;
  const t = useTranslations("Clients");
  const router = useRouter();
  const clientDialog = useRef<HTMLDialogElement>(null);
  const siteDialog = useRef<HTMLDialogElement>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [siteTarget, setSiteTarget] = useState<ClientWithSites | null>(null);
  const [clientResult, setClientResult] = useState(emptyResult);
  const [siteResult, setSiteResult] = useState(emptyResult);
  const [busy, setBusy] = useState(false);
  const filteredClients = useMemo(
    () => filterClients(clients, searchTerm),
    [clients, searchTerm],
  );

  function openClientDialog() {
    setClientResult(emptyResult);
    clientDialog.current?.showModal();
    clientDialog.current?.querySelector("input")?.focus();
  }

  function openSiteDialog(client: ClientWithSites) {
    setSiteTarget(client);
    setSiteResult(emptyResult);
    siteDialog.current?.showModal();
    siteDialog.current?.querySelector("input")?.focus();
  }

  async function handleCreateClient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    try {
      const result = localiseMutationResult(
        await createClient(new FormData(form)),
        locale,
      );
      setClientResult(result);
      if (result.ok) {
        form.reset();
        clientDialog.current?.close();
        router.refresh();
      }
    } catch {
      setClientResult({
        ok: false,
        fieldErrors: {},
        formError: t("clientCreateFailed"),
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateSite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    try {
      const result = localiseMutationResult(
        await createSite(new FormData(form)),
        locale,
      );
      setSiteResult(result);
      if (result.ok) {
        form.reset();
        siteDialog.current?.close();
        router.refresh();
      }
    } catch {
      setSiteResult({
        ok: false,
        fieldErrors: {},
        formError: t("siteCreateFailed"),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="clients-toolbar">
        <label className="search-field">
          <Search aria-hidden="true" size={19} />
          <span className="visually-hidden">{t("search")}</span>
          <input
            aria-label={t("search")}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder={t("searchPlaceholder")}
            type="search"
            value={searchTerm}
          />
        </label>
        <div className="clients-toolbar__actions">
          <Link className="button button--secondary" href="/clients/import">
            <FileUp aria-hidden="true" size={18} />
            {t("importCsv")}
          </Link>
          <button className="button" onClick={openClientDialog} type="button">
            <Plus aria-hidden="true" size={18} />
            {t("addClient")}
          </button>
        </div>
      </div>

      {filteredClients.length ? (
        <div className="client-list" aria-label={t("records")}>
          {filteredClients.map((client) => (
            <article className="client-card" aria-label={client.name} key={client.id}>
              <header className="client-card__header">
                <div>
                  <p className="record-kicker">{t("client")}</p>
                  <h2><Link href={`/clients/${client.id}`}>{client.name}</Link></h2>
                  <p className="client-contact">
                    {client.contactName ?? t("noContact")}
                    {client.phone ? ` · ${client.phone}` : ""}
                  </p>
                </div>
                <button
                  aria-label={t("addSiteTo", { clientName: client.name })}
                  className="button button--secondary button--small"
                  onClick={() => openSiteDialog(client)}
                  type="button"
                >
                  <Plus aria-hidden="true" size={17} />
                  {t("addSite")}
                </button>
              </header>

              {client.sites.length ? (
                <ul className="site-list">
                  {client.sites.map((site) => (
                    <li className="site-row" key={site.id}>
                      <span className="site-icon" aria-hidden="true">
                        <MapPin size={18} />
                      </span>
                      <div>
                        <strong>{site.name}</strong>
                        <span>{site.address} · {site.suburb}</span>
                        <span className="site-default-summary">{formatSiteDefaults(site, locale)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="client-card__empty">
                  <Building2 aria-hidden="true" size={19} />
                  {t("noSites")}
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <div className="records-empty">
          <Building2 aria-hidden="true" size={28} />
          <h2>{clients.length ? t("noMatching") : t("addFirst")}</h2>
          <p>
            {clients.length
              ? t("trySearch")
              : t("relationshipDescription")}
          </p>
        </div>
      )}

      <dialog aria-labelledby="add-client-title" className="record-dialog" ref={clientDialog}>
        <form className="dialog-form" onSubmit={handleCreateClient} noValidate>
          <header className="dialog-header">
            <div>
              <p className="record-kicker">{t("newRecord")}</p>
              <h2 id="add-client-title">{t("addClient")}</h2>
            </div>
            <button
              aria-label={t("closeAddClient")}
              className="icon-button"
              onClick={() => clientDialog.current?.close()}
              type="button"
            >
              <X aria-hidden="true" size={19} />
            </button>
          </header>
          <div className="field">
            <label htmlFor="new-client-name">{t("clientName")}</label>
            <input
              aria-describedby={clientResult.fieldErrors.name ? "new-client-name-error" : undefined}
              aria-invalid={Boolean(clientResult.fieldErrors.name)}
              id="new-client-name"
              name="name"
              type="text"
            />
            <FieldError id="new-client-name-error" message={clientResult.fieldErrors.name} />
          </div>
          <div className="dialog-columns">
            <div className="field">
              <label htmlFor="new-client-contact">{t("contactPerson")}</label>
              <input id="new-client-contact" name="contactName" type="text" />
              <FieldError id="new-client-contact-error" message={clientResult.fieldErrors.contactName} />
            </div>
            <div className="field">
              <label htmlFor="new-client-phone">{t("phone")}</label>
              <input id="new-client-phone" name="phone" type="tel" />
              <FieldError id="new-client-phone-error" message={clientResult.fieldErrors.phone} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="new-client-notes">{t("internalNotes")}</label>
            <textarea id="new-client-notes" name="notes" rows={3} />
            <FieldError id="new-client-notes-error" message={clientResult.fieldErrors.notes} />
          </div>
          {clientResult.formError ? (
            <p className="form-error" role="alert">{clientResult.formError}</p>
          ) : null}
          <footer className="dialog-actions">
            <button className="button button--secondary" onClick={() => clientDialog.current?.close()} type="button">
              {t("cancel")}
            </button>
            <button className="button" disabled={busy} type="submit">
              {busy ? t("creating") : t("createClient")}
            </button>
          </footer>
        </form>
      </dialog>

      <dialog aria-labelledby="add-site-title" className="record-dialog" ref={siteDialog}>
        <form className="dialog-form" onSubmit={handleCreateSite} noValidate>
          <input name="clientId" type="hidden" value={siteTarget?.id ?? ""} />
          <header className="dialog-header">
            <div>
              <p className="record-kicker">{siteTarget?.name ?? t("client")}</p>
              <h2 id="add-site-title">
                {t("addSiteTo", { clientName: siteTarget?.name ?? t("client") })}
              </h2>
            </div>
            <button
              aria-label={t("closeAddSite")}
              className="icon-button"
              onClick={() => siteDialog.current?.close()}
              type="button"
            >
              <X aria-hidden="true" size={19} />
            </button>
          </header>
          <div className="field">
            <label htmlFor="new-site-name">{t("siteName")}</label>
            <input aria-invalid={Boolean(siteResult.fieldErrors.name)} id="new-site-name" name="name" type="text" />
            <FieldError id="new-site-name-error" message={siteResult.fieldErrors.name} />
          </div>
          <div className="field">
            <label htmlFor="new-site-address">{t("streetAddress")}</label>
            <input aria-invalid={Boolean(siteResult.fieldErrors.address)} id="new-site-address" name="address" type="text" />
            <FieldError id="new-site-address-error" message={siteResult.fieldErrors.address} />
          </div>
          <div className="dialog-columns">
            <div className="field">
              <label htmlFor="new-site-suburb">{t("suburb")}</label>
              <input aria-invalid={Boolean(siteResult.fieldErrors.suburb)} id="new-site-suburb" name="suburb" type="text" />
              <FieldError id="new-site-suburb-error" message={siteResult.fieldErrors.suburb} />
            </div>
            <div className="field">
              <label htmlFor="new-site-access">{t("accessNotes")}</label>
              <input id="new-site-access" name="accessNotes" type="text" />
              <FieldError id="new-site-access-error" message={siteResult.fieldErrors.accessNotes} />
            </div>
          </div>
          {siteResult.formError ? (
            <p className="form-error" role="alert">{siteResult.formError}</p>
          ) : null}
          <footer className="dialog-actions">
            <button className="button button--secondary" onClick={() => siteDialog.current?.close()} type="button">
              {t("cancel")}
            </button>
            <button className="button" disabled={busy} type="submit">
              {busy ? t("creating") : t("createSite")}
            </button>
          </footer>
        </form>
      </dialog>
    </>
  );
}
