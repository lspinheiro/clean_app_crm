"use client";

import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Clock3,
  DollarSign,
  MapPin,
  Pencil,
  ShieldCheck,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useRef, useState } from "react";

import {
  updateClient,
  updateSite,
  savePreferredCleanerOrder,
  type RecordMutationResult,
} from "@/app/actions/clients";
import type {
  ClientWithSites,
  PoolCleaner,
  PreferredCleaner,
  ServiceOption,
  SiteSummary,
} from "@/features/clients/types";
import {
  formatAud,
  formatDuration,
  formatSiteDefaults,
} from "@/features/site-defaults/format";
import {
  moveCleaner,
  removeCleaner,
} from "@/features/preferred-cleaners/order";

const emptyResult: RecordMutationResult = {
  ok: false,
  fieldErrors: {},
  formError: null,
};

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <span className="field-error" id={id} role="alert">
      {message}
    </span>
  ) : null;
}

function cleanersForIds(preferred: PreferredCleaner[], cleanerIds: string[]) {
  const cleanersById = new Map(preferred.map((cleaner) => [cleaner.id, cleaner]));
  return cleanerIds.flatMap((cleanerId) => {
    const cleaner = cleanersById.get(cleanerId);
    return cleaner ? [cleaner] : [];
  });
}

type ClientDetailWorkspaceProps = {
  client: ClientWithSites;
  poolCleaners: PoolCleaner[];
  services: ServiceOption[];
};

export function ClientDetailWorkspace({
  client,
  poolCleaners,
  services,
}: ClientDetailWorkspaceProps) {
  const router = useRouter();
  const clientDialog = useRef<HTMLDialogElement>(null);
  const siteDialog = useRef<HTMLDialogElement>(null);
  const [siteTarget, setSiteTarget] = useState<SiteSummary | null>(null);
  const [clientResult, setClientResult] = useState(emptyResult);
  const [siteResult, setSiteResult] = useState(emptyResult);
  const [busy, setBusy] = useState(false);
  const [savingPreferenceSiteId, setSavingPreferenceSiteId] = useState<string | null>(null);
  const [preferenceErrors, setPreferenceErrors] = useState<Record<string, string>>({});
  const [preferenceStatuses, setPreferenceStatuses] = useState<Record<string, string>>({});
  const [selectedCleaners, setSelectedCleaners] = useState<Record<string, string>>({});
  const preferenceSelects = useRef<Record<string, HTMLSelectElement | null>>({});
  const [preferredBySite, setPreferredBySite] = useState<Record<string, PreferredCleaner[]>>(
    () => Object.fromEntries(client.sites.map((site) => [site.id, site.preferredCleaners])),
  );

  function openClientDialog() {
    setClientResult(emptyResult);
    clientDialog.current?.showModal();
  }

  function openSiteDialog(site: SiteSummary) {
    setSiteTarget(site);
    setSiteResult(emptyResult);
    siteDialog.current?.showModal();
  }

  async function handleUpdateClient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await updateClient(new FormData(event.currentTarget));
      setClientResult(result);
      if (result.ok) {
        clientDialog.current?.close();
        router.refresh();
      }
    } catch {
      setClientResult({
        ok: false,
        fieldErrors: {},
        formError: "The client could not be saved. Please try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdateSite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await updateSite(new FormData(event.currentTarget));
      setSiteResult(result);
      if (result.ok) {
        siteDialog.current?.close();
        router.refresh();
      }
    } catch {
      setSiteResult({
        ok: false,
        fieldErrors: {},
        formError: "The site could not be saved. Please try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function persistPreferredOrder(
    site: SiteSummary,
    nextOrder: PreferredCleaner[],
    focusSelectAfterSave = false,
  ) {
    const previousOrder = preferredBySite[site.id] ?? site.preferredCleaners;
    const rankedOrder = nextOrder.map((cleaner, index) => ({ ...cleaner, rank: index + 1 }));
    setPreferredBySite((current) => ({ ...current, [site.id]: rankedOrder }));
    setPreferenceErrors((current) => ({ ...current, [site.id]: "" }));
    setPreferenceStatuses((current) => ({
      ...current,
      [site.id]: "Saving preferred cleaner order…",
    }));
    setSavingPreferenceSiteId(site.id);

    try {
      const result = await savePreferredCleanerOrder({
        clientId: client.id,
        siteId: site.id,
        cleanerIds: rankedOrder.map((cleaner) => cleaner.id),
      });
      if (!result.ok) {
        setPreferredBySite((current) => ({ ...current, [site.id]: previousOrder }));
        setPreferenceErrors((current) => ({
          ...current,
          [site.id]: result.formError ?? "The preferred cleaner order could not be saved.",
        }));
        setPreferenceStatuses((current) => ({
          ...current,
          [site.id]: "Preferred cleaner order was not saved.",
        }));
        return;
      }
      setSelectedCleaners((current) => ({ ...current, [site.id]: "" }));
      setPreferenceStatuses((current) => ({
        ...current,
        [site.id]: "Preferred cleaner order saved.",
      }));
      router.refresh();
    } catch {
      setPreferredBySite((current) => ({ ...current, [site.id]: previousOrder }));
      setPreferenceErrors((current) => ({
        ...current,
        [site.id]: "The preferred cleaner order could not be saved. Please try again.",
      }));
      setPreferenceStatuses((current) => ({
        ...current,
        [site.id]: "Preferred cleaner order was not saved.",
      }));
    } finally {
      setSavingPreferenceSiteId(null);
      if (focusSelectAfterSave) {
        requestAnimationFrame(() => preferenceSelects.current[site.id]?.focus());
      }
    }
  }

  function addPreferredCleaner(site: SiteSummary, preferred: PreferredCleaner[]) {
    const cleanerId = selectedCleaners[site.id];
    const cleaner = poolCleaners.find((candidate) => candidate.id === cleanerId);
    if (!cleaner) return;
    void persistPreferredOrder(site, [
      ...preferred,
      { id: cleaner.id, name: cleaner.name, rank: preferred.length + 1 },
    ]);
  }

  function movePreferred(
    site: SiteSummary,
    preferred: PreferredCleaner[],
    cleanerId: string,
    direction: "up" | "down",
  ) {
    const reorderedIds = moveCleaner(
      preferred.map((cleaner) => cleaner.id),
      cleanerId,
      direction,
    );
    void persistPreferredOrder(site, cleanersForIds(preferred, reorderedIds));
  }

  return (
    <>
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/clients">Clients</Link>
        <span aria-hidden="true">/</span>
        <span>{client.name}</span>
      </nav>

      <header className="client-detail-header">
        <div>
          <p className="eyebrow">Client record</p>
          <h1 className="page-heading">{client.name}</h1>
          <p className="client-detail-contact">
            {client.contactName ?? "No contact recorded"}
            {client.phone ? ` · ${client.phone}` : ""}
          </p>
          <p className="client-detail-count">
            {client.sites.length} {client.sites.length === 1 ? "site" : "sites"}
          </p>
        </div>
        <button className="button button--secondary" onClick={openClientDialog} type="button">
          <Pencil aria-hidden="true" size={17} />
          Edit client
        </button>
      </header>

      <section className="site-detail-list" aria-label="Client sites">
        {client.sites.map((site, index) => {
          const preferred = preferredBySite[site.id] ?? site.preferredCleaners;
          const availableCleaners = poolCleaners.filter(
            (cleaner) => !preferred.some((preference) => preference.id === cleaner.id),
          );
          const savingPreferences = savingPreferenceSiteId !== null;

          return (
            <details
              aria-label={site.name}
              className="site-detail-card"
              key={site.id}
              open={index === 0 ? true : undefined}
              role="group"
            >
            <summary>
              <span>
                <strong>{site.name}</strong>
                <small>{formatSiteDefaults(site)}</small>
              </span>
              <ChevronDown aria-hidden="true" className="details-chevron" size={20} />
            </summary>
            <div className="site-detail-content">
              <div className="site-address-block">
                <span className="detail-icon" aria-hidden="true"><MapPin size={19} /></span>
                <div>
                  <p>{site.address}, {site.suburb}</p>
                  <span className="privacy-caption">
                    <ShieldCheck aria-hidden="true" size={15} />
                    Address and access notes are shown to a cleaner only after assignment
                  </span>
                </div>
              </div>

              <div className="site-notes-block">
                <span>Access notes</span>
                <p>{site.accessNotes ?? "None recorded"}</p>
              </div>

              <section
                aria-busy={savingPreferenceSiteId === site.id}
                className="preferred-cleaners-block"
              >
                <div className="preferred-cleaners-heading">
                  <div>
                    <h3>Preferred cleaners</h3>
                    <p>Captured now; roster ordering uses this list in a later Milestone.</p>
                  </div>
                </div>

                {preferred.length ? (
                  <ol
                    aria-label={`Preferred cleaners for ${site.name}`}
                    className="preferred-cleaner-list"
                  >
                    {preferred.map((cleaner, cleanerIndex) => (
                      <li key={cleaner.id}>
                        <span className="preference-rank">{cleanerIndex + 1}</span>
                        <strong>{cleaner.name}</strong>
                        <span className="preference-actions">
                          <button
                            aria-label={`Move ${cleaner.name} up`}
                            className="icon-button icon-button--small"
                            disabled={savingPreferences || cleanerIndex === 0}
                            onClick={() => movePreferred(site, preferred, cleaner.id, "up")}
                            type="button"
                          >
                            <ArrowUp aria-hidden="true" size={16} />
                          </button>
                          <button
                            aria-label={`Move ${cleaner.name} down`}
                            className="icon-button icon-button--small"
                            disabled={savingPreferences || cleanerIndex === preferred.length - 1}
                            onClick={() => movePreferred(site, preferred, cleaner.id, "down")}
                            type="button"
                          >
                            <ArrowDown aria-hidden="true" size={16} />
                          </button>
                          <button
                            aria-label={`Remove ${cleaner.name}`}
                            className="icon-button icon-button--small"
                            disabled={savingPreferences}
                            onClick={() =>
                              void persistPreferredOrder(
                                site,
                                cleanersForIds(
                                  preferred,
                                  removeCleaner(
                                    preferred.map((item) => item.id),
                                    cleaner.id,
                                  ),
                                ),
                                true,
                              )
                            }
                            type="button"
                          >
                            <Trash2 aria-hidden="true" size={16} />
                          </button>
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="preferred-empty">No preferred cleaners recorded.</p>
                )}

                <div className="preferred-add-row">
                  <div className="field">
                    <label htmlFor={`preferred-cleaner-${site.id}`}>Preferred cleaner</label>
                    <select
                      disabled={!availableCleaners.length || savingPreferences}
                      id={`preferred-cleaner-${site.id}`}
                      onChange={(event) =>
                        setSelectedCleaners((current) => ({
                          ...current,
                          [site.id]: event.target.value,
                        }))
                      }
                      ref={(select) => {
                        preferenceSelects.current[site.id] = select;
                      }}
                      value={selectedCleaners[site.id] ?? ""}
                    >
                      <option value="">
                        {availableCleaners.length ? "Choose from cleaner pool" : "All pool cleaners added"}
                      </option>
                      {availableCleaners.map((cleaner) => (
                        <option key={cleaner.id} value={cleaner.id}>{cleaner.name}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    aria-label={`Add preferred cleaner to ${site.name}`}
                    className="button button--secondary button--small"
                    disabled={savingPreferences || !selectedCleaners[site.id]}
                    onClick={() => addPreferredCleaner(site, preferred)}
                    type="button"
                  >
                    <UserPlus aria-hidden="true" size={16} />
                    Add
                  </button>
                </div>
                {preferenceErrors[site.id] ? (
                  <p className="form-error" role="alert">{preferenceErrors[site.id]}</p>
                ) : null}
                <p
                  aria-live="polite"
                  className="preference-status"
                  role="status"
                >
                  {preferenceStatuses[site.id] ?? ""}
                </p>
              </section>

              <dl className="defaults-grid">
                <div>
                  <dt>Default service</dt>
                  <dd>{site.defaultService?.name ?? "Not set"}</dd>
                </div>
                <div>
                  <dt><Clock3 aria-hidden="true" size={16} /> Duration</dt>
                  <dd className="tabular-numerals">
                    {site.defaultDurationMinutes === null
                      ? "Not set"
                      : formatDuration(site.defaultDurationMinutes)}
                  </dd>
                </div>
                <div>
                  <dt><DollarSign aria-hidden="true" size={16} /> Rate (AUD)</dt>
                  <dd className="tabular-numerals">
                    {site.defaultRateCents === null ? "Not set" : formatAud(site.defaultRateCents)}
                  </dd>
                </div>
              </dl>

              <div className="site-detail-actions">
                <button
                  aria-label={`Edit ${site.name}`}
                  className="button button--secondary button--small"
                  onClick={() => openSiteDialog(site)}
                  type="button"
                >
                  <Pencil aria-hidden="true" size={16} />
                  Edit site
                </button>
              </div>
            </div>
            </details>
          );
        })}
      </section>

      <dialog aria-labelledby="edit-client-title" className="record-dialog" ref={clientDialog}>
        <form className="dialog-form" onSubmit={handleUpdateClient} noValidate>
          <input name="clientId" type="hidden" value={client.id} />
          <header className="dialog-header">
            <div>
              <p className="record-kicker">Client record</p>
              <h2 id="edit-client-title">Edit {client.name}</h2>
            </div>
            <button aria-label="Close edit client" className="icon-button" onClick={() => clientDialog.current?.close()} type="button">
              <X aria-hidden="true" size={19} />
            </button>
          </header>
          <div className="field">
            <label htmlFor="edit-client-name">Client name</label>
            <input defaultValue={client.name} id="edit-client-name" name="name" type="text" />
            <FieldError id="edit-client-name-error" message={clientResult.fieldErrors.name} />
          </div>
          <div className="dialog-columns">
            <div className="field">
              <label htmlFor="edit-client-contact">Contact person</label>
              <input defaultValue={client.contactName ?? ""} id="edit-client-contact" name="contactName" type="text" />
              <FieldError id="edit-client-contact-error" message={clientResult.fieldErrors.contactName} />
            </div>
            <div className="field">
              <label htmlFor="edit-client-phone">Phone</label>
              <input defaultValue={client.phone ?? ""} id="edit-client-phone" name="phone" type="tel" />
              <FieldError id="edit-client-phone-error" message={clientResult.fieldErrors.phone} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="edit-client-notes">Internal notes</label>
            <textarea defaultValue={client.notes ?? ""} id="edit-client-notes" name="notes" rows={3} />
            <FieldError id="edit-client-notes-error" message={clientResult.fieldErrors.notes} />
          </div>
          {clientResult.formError ? <p className="form-error" role="alert">{clientResult.formError}</p> : null}
          <footer className="dialog-actions">
            <button className="button button--secondary" onClick={() => clientDialog.current?.close()} type="button">Cancel</button>
            <button className="button" disabled={busy} type="submit">{busy ? "Saving…" : "Save client"}</button>
          </footer>
        </form>
      </dialog>

      <dialog aria-labelledby="edit-site-title" className="record-dialog" ref={siteDialog}>
        <form className="dialog-form" key={siteTarget?.id} onSubmit={handleUpdateSite} noValidate>
          <input name="clientId" type="hidden" value={client.id} />
          <input name="siteId" type="hidden" value={siteTarget?.id ?? ""} />
          <header className="dialog-header">
            <div>
              <p className="record-kicker">Site defaults</p>
              <h2 id="edit-site-title">Edit {siteTarget?.name ?? "site"}</h2>
            </div>
            <button aria-label="Close edit site" className="icon-button" onClick={() => siteDialog.current?.close()} type="button">
              <X aria-hidden="true" size={19} />
            </button>
          </header>
          <div className="dialog-columns">
            <div className="field">
              <label htmlFor="edit-site-name">Site name</label>
              <input defaultValue={siteTarget?.name ?? ""} id="edit-site-name" name="name" type="text" />
              <FieldError id="edit-site-name-error" message={siteResult.fieldErrors.name} />
            </div>
            <div className="field">
              <label htmlFor="edit-site-suburb">Suburb</label>
              <input defaultValue={siteTarget?.suburb ?? ""} id="edit-site-suburb" name="suburb" type="text" />
              <FieldError id="edit-site-suburb-error" message={siteResult.fieldErrors.suburb} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="edit-site-address">Street address</label>
            <input defaultValue={siteTarget?.address ?? ""} id="edit-site-address" name="address" type="text" />
            <FieldError id="edit-site-address-error" message={siteResult.fieldErrors.address} />
          </div>
          <div className="field">
            <label htmlFor="edit-site-access">Access notes</label>
            <textarea defaultValue={siteTarget?.accessNotes ?? ""} id="edit-site-access" name="accessNotes" rows={3} />
            <FieldError id="edit-site-access-error" message={siteResult.fieldErrors.accessNotes} />
          </div>
          <div className="defaults-form-grid">
            <div className="field">
              <label htmlFor="edit-site-service">Default service</label>
              <select defaultValue={siteTarget?.defaultService?.id ?? ""} id="edit-site-service" name="defaultServiceId">
                <option disabled value="">Choose service</option>
                {services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
              </select>
              <FieldError id="edit-site-service-error" message={siteResult.fieldErrors.defaultServiceId} />
            </div>
            <div className="field">
              <label htmlFor="edit-site-duration">Duration (hours)</label>
              <input defaultValue={siteTarget?.defaultDurationMinutes ? siteTarget.defaultDurationMinutes / 60 : ""} id="edit-site-duration" min="0.25" name="durationHours" step="0.25" type="number" />
              <FieldError id="edit-site-duration-error" message={siteResult.fieldErrors.durationHours} />
            </div>
            <div className="field">
              <label htmlFor="edit-site-rate">Rate (AUD)</label>
              <input defaultValue={siteTarget?.defaultRateCents ? (siteTarget.defaultRateCents / 100).toFixed(2) : ""} id="edit-site-rate" inputMode="decimal" min="0.01" name="rateAud" step="0.01" type="number" />
              <FieldError id="edit-site-rate-error" message={siteResult.fieldErrors.rateAud} />
            </div>
          </div>
          {siteResult.formError ? <p className="form-error" role="alert">{siteResult.formError}</p> : null}
          <footer className="dialog-actions">
            <button className="button button--secondary" onClick={() => siteDialog.current?.close()} type="button">Cancel</button>
            <button className="button" disabled={busy} type="submit">{busy ? "Saving…" : "Save site"}</button>
          </footer>
        </form>
      </dialog>
    </>
  );
}
