"use client";

import { Building2, MapPin, Plus, Search, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useMemo, useRef, useState } from "react";

import {
  createClient,
  createSite,
  type RecordMutationResult,
} from "@/app/actions/clients";
import { filterClients } from "@/features/clients/filter";
import type { ClientWithSites } from "@/features/clients/types";
import { formatSiteDefaults } from "@/features/site-defaults/format";

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
  }

  function openSiteDialog(client: ClientWithSites) {
    setSiteTarget(client);
    setSiteResult(emptyResult);
    siteDialog.current?.showModal();
  }

  async function handleCreateClient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    try {
      const result = await createClient(new FormData(form));
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
        formError: "The client could not be created. Please try again.",
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
      const result = await createSite(new FormData(form));
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
        formError: "The site could not be created. Please try again.",
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
          <span className="visually-hidden">Search clients and sites</span>
          <input
            aria-label="Search clients and sites"
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search clients or sites"
            type="search"
            value={searchTerm}
          />
        </label>
        <button className="button" onClick={openClientDialog} type="button">
          <Plus aria-hidden="true" size={18} />
          Add client
        </button>
      </div>

      {filteredClients.length ? (
        <div className="client-list" aria-label="Client records">
          {filteredClients.map((client) => (
            <article className="client-card" aria-label={client.name} key={client.id}>
              <header className="client-card__header">
                <div>
                  <p className="record-kicker">Client</p>
                  <h2><Link href={`/clients/${client.id}`}>{client.name}</Link></h2>
                  <p className="client-contact">
                    {client.contactName ?? "No contact recorded"}
                    {client.phone ? ` · ${client.phone}` : ""}
                  </p>
                </div>
                <button
                  aria-label={`Add site to ${client.name}`}
                  className="button button--secondary button--small"
                  onClick={() => openSiteDialog(client)}
                  type="button"
                >
                  <Plus aria-hidden="true" size={17} />
                  Add site
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
                        <span className="site-default-summary">{formatSiteDefaults(site)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="client-card__empty">
                  <Building2 aria-hidden="true" size={19} />
                  No sites yet
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <div className="records-empty">
          <Building2 aria-hidden="true" size={28} />
          <h2>{clients.length ? "No matching records" : "Add your first client"}</h2>
          <p>
            {clients.length
              ? "Try a client name or a site name."
              : "Clients hold the commercial relationship; each cleaning location is a site."}
          </p>
        </div>
      )}

      <dialog aria-labelledby="add-client-title" className="record-dialog" ref={clientDialog}>
        <form className="dialog-form" onSubmit={handleCreateClient} noValidate>
          <header className="dialog-header">
            <div>
              <p className="record-kicker">New record</p>
              <h2 id="add-client-title">Add client</h2>
            </div>
            <button
              aria-label="Close add client"
              className="icon-button"
              onClick={() => clientDialog.current?.close()}
              type="button"
            >
              <X aria-hidden="true" size={19} />
            </button>
          </header>
          <div className="field">
            <label htmlFor="new-client-name">Client name</label>
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
              <label htmlFor="new-client-contact">Contact person</label>
              <input id="new-client-contact" name="contactName" type="text" />
              <FieldError id="new-client-contact-error" message={clientResult.fieldErrors.contactName} />
            </div>
            <div className="field">
              <label htmlFor="new-client-phone">Phone</label>
              <input id="new-client-phone" name="phone" type="tel" />
              <FieldError id="new-client-phone-error" message={clientResult.fieldErrors.phone} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="new-client-notes">Internal notes</label>
            <textarea id="new-client-notes" name="notes" rows={3} />
            <FieldError id="new-client-notes-error" message={clientResult.fieldErrors.notes} />
          </div>
          {clientResult.formError ? (
            <p className="form-error" role="alert">{clientResult.formError}</p>
          ) : null}
          <footer className="dialog-actions">
            <button className="button button--secondary" onClick={() => clientDialog.current?.close()} type="button">
              Cancel
            </button>
            <button className="button" disabled={busy} type="submit">
              {busy ? "Creating…" : "Create client"}
            </button>
          </footer>
        </form>
      </dialog>

      <dialog aria-labelledby="add-site-title" className="record-dialog" ref={siteDialog}>
        <form className="dialog-form" onSubmit={handleCreateSite} noValidate>
          <input name="clientId" type="hidden" value={siteTarget?.id ?? ""} />
          <header className="dialog-header">
            <div>
              <p className="record-kicker">{siteTarget?.name ?? "Client"}</p>
              <h2 id="add-site-title">Add site to {siteTarget?.name ?? "client"}</h2>
            </div>
            <button
              aria-label="Close add site"
              className="icon-button"
              onClick={() => siteDialog.current?.close()}
              type="button"
            >
              <X aria-hidden="true" size={19} />
            </button>
          </header>
          <div className="field">
            <label htmlFor="new-site-name">Site name</label>
            <input aria-invalid={Boolean(siteResult.fieldErrors.name)} id="new-site-name" name="name" type="text" />
            <FieldError id="new-site-name-error" message={siteResult.fieldErrors.name} />
          </div>
          <div className="field">
            <label htmlFor="new-site-address">Street address</label>
            <input aria-invalid={Boolean(siteResult.fieldErrors.address)} id="new-site-address" name="address" type="text" />
            <FieldError id="new-site-address-error" message={siteResult.fieldErrors.address} />
          </div>
          <div className="dialog-columns">
            <div className="field">
              <label htmlFor="new-site-suburb">Suburb</label>
              <input aria-invalid={Boolean(siteResult.fieldErrors.suburb)} id="new-site-suburb" name="suburb" type="text" />
              <FieldError id="new-site-suburb-error" message={siteResult.fieldErrors.suburb} />
            </div>
            <div className="field">
              <label htmlFor="new-site-access">Access notes</label>
              <input id="new-site-access" name="accessNotes" type="text" />
              <FieldError id="new-site-access-error" message={siteResult.fieldErrors.accessNotes} />
            </div>
          </div>
          {siteResult.formError ? (
            <p className="form-error" role="alert">{siteResult.formError}</p>
          ) : null}
          <footer className="dialog-actions">
            <button className="button button--secondary" onClick={() => siteDialog.current?.close()} type="button">
              Cancel
            </button>
            <button className="button" disabled={busy} type="submit">
              {busy ? "Creating…" : "Create site"}
            </button>
          </footer>
        </form>
      </dialog>
    </>
  );
}
