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
import { useLocale, useTranslations } from "next-intl";
import { type FormEvent, useRef, useState } from "react";

import {
  updateClient,
  updateSite,
  savePreferredCleanerOrder,
  type RecordMutationResult,
} from "@/app/actions/clients";
import type {
  ClientWithSites,
  CompanyCleaner,
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
import type { RecurringAssignmentsBySite } from "@/features/recurring-assignments/types";
import type { AppLocale } from "@/i18n/config";
import { Link, useRouter } from "@/i18n/navigation";
import { localiseMutationResult } from "@/i18n/user-message";
import { reloadCurrentPage } from "@/lib/reload-page";

import { SiteRecurringAssignments } from "./site-recurring-assignments";

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
  cleaners: CompanyCleaner[];
  recurringAssignmentsBySite: RecurringAssignmentsBySite;
  services: ServiceOption[];
};

export function ClientDetailWorkspace({
  client,
  cleaners,
  recurringAssignmentsBySite,
  services,
}: ClientDetailWorkspaceProps) {
  const locale = useLocale() as AppLocale;
  const t = useTranslations("ClientDetail");
  const clientsT = useTranslations("Clients");
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
      const result = localiseMutationResult(
        await updateClient(new FormData(event.currentTarget)),
        locale,
      );
      setClientResult(result);
      if (result.ok) {
        clientDialog.current?.close();
        router.refresh();
      }
    } catch {
      setClientResult({
        ok: false,
        fieldErrors: {},
        formError: t("clientSaveFailed"),
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdateSite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = localiseMutationResult(
        await updateSite(new FormData(event.currentTarget)),
        locale,
      );
      setSiteResult(result);
      if (result.ok) {
        siteDialog.current?.close();
        router.refresh();
      }
    } catch {
      setSiteResult({
        ok: false,
        fieldErrors: {},
        formError: t("siteSaveFailed"),
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
    const rankedOrder = nextOrder.map((cleaner, index) => ({ ...cleaner, rank: index + 1 }));
    setPreferredBySite((current) => ({ ...current, [site.id]: rankedOrder }));
    setPreferenceErrors((current) => ({ ...current, [site.id]: "" }));
    setPreferenceStatuses((current) => ({
      ...current,
      [site.id]: t("savingOrder"),
    }));
    setSavingPreferenceSiteId(site.id);
    let reconcilingCanonicalOrder = false;

    function reconcileCanonicalOrder() {
      reconcilingCanonicalOrder = true;
      setPreferenceErrors((current) => ({
        ...current,
        [site.id]:
          t("saveNotConfirmed"),
      }));
      setPreferenceStatuses((current) => ({
        ...current,
        [site.id]: t("refreshingOrder"),
      }));
      reloadCurrentPage();
    }

    try {
      const result = await savePreferredCleanerOrder({
        clientId: client.id,
        siteId: site.id,
        cleanerIds: rankedOrder.map((cleaner) => cleaner.id),
      });
      if (!result.ok) {
        reconcileCanonicalOrder();
        return;
      }
      setSelectedCleaners((current) => ({ ...current, [site.id]: "" }));
      setPreferenceStatuses((current) => ({
        ...current,
        [site.id]: t("orderSaved"),
      }));
      router.refresh();
    } catch {
      reconcileCanonicalOrder();
    } finally {
      if (!reconcilingCanonicalOrder) {
        setSavingPreferenceSiteId(null);
        if (focusSelectAfterSave) {
          requestAnimationFrame(() => preferenceSelects.current[site.id]?.focus());
        }
      }
    }
  }

  function addPreferredCleaner(site: SiteSummary, preferred: PreferredCleaner[]) {
    const cleanerId = selectedCleaners[site.id];
    const cleaner = cleaners.find((candidate) => candidate.id === cleanerId);
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
      <nav className="breadcrumb" aria-label={t("breadcrumb")}>
        <Link href="/clients">{t("clients")}</Link>
        <span aria-hidden="true">/</span>
        <span>{client.name}</span>
      </nav>

      <header className="client-detail-header">
        <div>
          <p className="eyebrow">{t("clientRecord")}</p>
          <h1 className="page-heading">{client.name}</h1>
          <p className="client-detail-contact">
            {client.contactName ?? t("noContact")}
            {client.phone ? ` · ${client.phone}` : ""}
          </p>
          <p className="client-detail-count">
            {t("siteCount", { count: client.sites.length })}
          </p>
        </div>
        <button className="button button--secondary" onClick={openClientDialog} type="button">
          <Pencil aria-hidden="true" size={17} />
          {t("editClient")}
        </button>
      </header>

      <section className="site-detail-list" aria-label={t("clientSites")}>
        {client.sites.map((site, index) => {
          const preferred = preferredBySite[site.id] ?? site.preferredCleaners;
          const availableCleaners = cleaners.filter(
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
                <small>{formatSiteDefaults(site, locale, clientsT("defaultsNotSet"))}</small>
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
                    {t("privacy")}
                  </span>
                </div>
              </div>

              <div className="site-notes-block">
                <span>{t("accessNotes")}</span>
                <p>{site.accessNotes ?? t("noneRecorded")}</p>
              </div>

              <section
                aria-busy={savingPreferenceSiteId === site.id}
                className="preferred-cleaners-block"
              >
                <div className="preferred-cleaners-heading">
                  <div>
                    <h3>{t("preferredCleaners")}</h3>
                    <p>{t("preferredDescription")}</p>
                  </div>
                </div>

                {preferred.length ? (
                  <ol
                    aria-label={t("preferredForSite", { siteName: site.name })}
                    className="preferred-cleaner-list"
                  >
                    {preferred.map((cleaner, cleanerIndex) => (
                      <li key={cleaner.id}>
                        <span className="preference-rank">{cleanerIndex + 1}</span>
                        <strong>{cleaner.name}</strong>
                        <span className="preference-actions">
                          <button
                            aria-label={t("moveUp", { cleanerName: cleaner.name })}
                            className="icon-button icon-button--small"
                            disabled={savingPreferences || cleanerIndex === 0}
                            onClick={() => movePreferred(site, preferred, cleaner.id, "up")}
                            type="button"
                          >
                            <ArrowUp aria-hidden="true" size={16} />
                          </button>
                          <button
                            aria-label={t("moveDown", { cleanerName: cleaner.name })}
                            className="icon-button icon-button--small"
                            disabled={savingPreferences || cleanerIndex === preferred.length - 1}
                            onClick={() => movePreferred(site, preferred, cleaner.id, "down")}
                            type="button"
                          >
                            <ArrowDown aria-hidden="true" size={16} />
                          </button>
                          <button
                            aria-label={t("remove", { cleanerName: cleaner.name })}
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
                  <p className="preferred-empty">{t("noPreferred")}</p>
                )}

                <div className="preferred-add-row">
                  <div className="field">
                    <label htmlFor={`preferred-cleaner-${site.id}`}>{t("preferredCleaner")}</label>
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
                        {availableCleaners.length ? t("chooseFromCleaners") : t("allAdded")}
                      </option>
                      {availableCleaners.map((cleaner) => (
                        <option key={cleaner.id} value={cleaner.id}>{cleaner.name}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    aria-label={t("addPreferred", { siteName: site.name })}
                    className="button button--secondary button--small"
                    disabled={savingPreferences || !selectedCleaners[site.id]}
                    onClick={() => addPreferredCleaner(site, preferred)}
                    type="button"
                  >
                    <UserPlus aria-hidden="true" size={16} />
                    {t("add")}
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
                  <dt>{t("defaultService")}</dt>
                  <dd>{site.defaultService?.name ?? t("notSet")}</dd>
                </div>
                <div>
                  <dt><Clock3 aria-hidden="true" size={16} /> {t("duration")}</dt>
                  <dd className="tabular-numerals">
                    {site.defaultDurationMinutes === null
                      ? t("notSet")
                      : formatDuration(site.defaultDurationMinutes, locale)}
                  </dd>
                </div>
                <div>
                  <dt><DollarSign aria-hidden="true" size={16} /> {t("rate")}</dt>
                  <dd className="tabular-numerals">
                    {site.defaultRateCents === null
                      ? t("notSet")
                      : formatAud(site.defaultRateCents, locale)}
                  </dd>
                </div>
              </dl>

              <SiteRecurringAssignments
                assignments={recurringAssignmentsBySite[site.id] ?? []}
                clientId={client.id}
                defaultDurationMinutes={site.defaultDurationMinutes}
                defaultServiceId={site.defaultService?.id ?? null}
                cleaners={cleaners}
                services={services}
                siteId={site.id}
                siteName={site.name}
              />

              <div className="site-detail-actions">
                <button
                  aria-label={t("editNamed", { name: site.name })}
                  className="button button--secondary button--small"
                  onClick={() => openSiteDialog(site)}
                  type="button"
                >
                  <Pencil aria-hidden="true" size={16} />
                  {t("editSite")}
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
              <p className="record-kicker">{t("clientRecord")}</p>
              <h2 id="edit-client-title">{t("editNamed", { name: client.name })}</h2>
            </div>
            <button aria-label={t("closeEditClient")} className="icon-button" onClick={() => clientDialog.current?.close()} type="button">
              <X aria-hidden="true" size={19} />
            </button>
          </header>
          <div className="field">
            <label htmlFor="edit-client-name">{t("clientName")}</label>
            <input defaultValue={client.name} id="edit-client-name" name="name" type="text" />
            <FieldError id="edit-client-name-error" message={clientResult.fieldErrors.name} />
          </div>
          <div className="dialog-columns">
            <div className="field">
              <label htmlFor="edit-client-contact">{t("contactPerson")}</label>
              <input defaultValue={client.contactName ?? ""} id="edit-client-contact" name="contactName" type="text" />
              <FieldError id="edit-client-contact-error" message={clientResult.fieldErrors.contactName} />
            </div>
            <div className="field">
              <label htmlFor="edit-client-phone">{t("phone")}</label>
              <input defaultValue={client.phone ?? ""} id="edit-client-phone" name="phone" type="tel" />
              <FieldError id="edit-client-phone-error" message={clientResult.fieldErrors.phone} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="edit-client-notes">{t("internalNotes")}</label>
            <textarea defaultValue={client.notes ?? ""} id="edit-client-notes" name="notes" rows={3} />
            <FieldError id="edit-client-notes-error" message={clientResult.fieldErrors.notes} />
          </div>
          {clientResult.formError ? <p className="form-error" role="alert">{clientResult.formError}</p> : null}
          <footer className="dialog-actions">
            <button className="button button--secondary" onClick={() => clientDialog.current?.close()} type="button">{t("cancel")}</button>
            <button className="button" disabled={busy} type="submit">{busy ? t("saving") : t("saveClient")}</button>
          </footer>
        </form>
      </dialog>

      <dialog aria-labelledby="edit-site-title" className="record-dialog" ref={siteDialog}>
        <form className="dialog-form" key={siteTarget?.id} onSubmit={handleUpdateSite} noValidate>
          <input name="clientId" type="hidden" value={client.id} />
          <input name="siteId" type="hidden" value={siteTarget?.id ?? ""} />
          <header className="dialog-header">
            <div>
              <p className="record-kicker">{t("siteDefaults")}</p>
              <h2 id="edit-site-title">
                {siteTarget ? t("editNamed", { name: siteTarget.name }) : t("editSite")}
              </h2>
            </div>
            <button aria-label={t("closeEditSite")} className="icon-button" onClick={() => siteDialog.current?.close()} type="button">
              <X aria-hidden="true" size={19} />
            </button>
          </header>
          <div className="dialog-columns">
            <div className="field">
              <label htmlFor="edit-site-name">{t("siteName")}</label>
              <input defaultValue={siteTarget?.name ?? ""} id="edit-site-name" name="name" type="text" />
              <FieldError id="edit-site-name-error" message={siteResult.fieldErrors.name} />
            </div>
            <div className="field">
              <label htmlFor="edit-site-suburb">{t("suburb")}</label>
              <input defaultValue={siteTarget?.suburb ?? ""} id="edit-site-suburb" name="suburb" type="text" />
              <FieldError id="edit-site-suburb-error" message={siteResult.fieldErrors.suburb} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="edit-site-address">{t("streetAddress")}</label>
            <input defaultValue={siteTarget?.address ?? ""} id="edit-site-address" name="address" type="text" />
            <FieldError id="edit-site-address-error" message={siteResult.fieldErrors.address} />
          </div>
          <div className="field">
            <label htmlFor="edit-site-access">{t("accessNotes")}</label>
            <textarea defaultValue={siteTarget?.accessNotes ?? ""} id="edit-site-access" name="accessNotes" rows={3} />
            <FieldError id="edit-site-access-error" message={siteResult.fieldErrors.accessNotes} />
          </div>
          <div className="defaults-form-grid">
            <div className="field">
              <label htmlFor="edit-site-service">{t("defaultService")}</label>
              <select defaultValue={siteTarget?.defaultService?.id ?? ""} id="edit-site-service" name="defaultServiceId">
                <option disabled value="">{t("chooseService")}</option>
                {services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
              </select>
              <FieldError id="edit-site-service-error" message={siteResult.fieldErrors.defaultServiceId} />
            </div>
            <div className="field">
              <label htmlFor="edit-site-duration">{t("durationHours")}</label>
              <input defaultValue={siteTarget?.defaultDurationMinutes ? siteTarget.defaultDurationMinutes / 60 : ""} id="edit-site-duration" min="0.25" name="durationHours" step="0.25" type="number" />
              <FieldError id="edit-site-duration-error" message={siteResult.fieldErrors.durationHours} />
            </div>
            <div className="field">
              <label htmlFor="edit-site-rate">{t("rate")}</label>
              <input defaultValue={siteTarget?.defaultRateCents ? (siteTarget.defaultRateCents / 100).toFixed(2) : ""} id="edit-site-rate" inputMode="decimal" min="0.01" name="rateAud" step="0.01" type="number" />
              <FieldError id="edit-site-rate-error" message={siteResult.fieldErrors.rateAud} />
            </div>
          </div>
          {siteResult.formError ? <p className="form-error" role="alert">{siteResult.formError}</p> : null}
          <footer className="dialog-actions">
            <button className="button button--secondary" onClick={() => siteDialog.current?.close()} type="button">{t("cancel")}</button>
            <button className="button" disabled={busy} type="submit">{busy ? t("saving") : t("saveSite")}</button>
          </footer>
        </form>
      </dialog>
    </>
  );
}
