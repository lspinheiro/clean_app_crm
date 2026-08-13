"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useMemo, useState } from "react";

import {
  createOneOffJob,
  type JobMutationResult,
} from "@/app/actions/jobs";

export type NewJobSite = {
  id: string;
  name: string;
  suburb: string;
  defaultServiceId: string | null;
  defaultDurationMinutes: number | null;
  defaultRateCents: number | null;
};

export type NewJobClient = {
  id: string;
  name: string;
  sites: NewJobSite[];
};

export type NewJobService = {
  id: string;
  name: string;
};

const emptyResult: JobMutationResult = {
  ok: false,
  fieldErrors: {},
  formError: null,
  jobId: null,
};

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <span className="field-error" id={id} role="alert">
      {message}
    </span>
  ) : null;
}

function errorProps(
  field: string,
  result: JobMutationResult,
): {
  "aria-describedby": string | undefined;
  "aria-invalid": true | undefined;
} {
  const message = result.fieldErrors[field];
  return {
    "aria-describedby": message ? `new-job-${field}-error` : undefined,
    "aria-invalid": message ? true : undefined,
  };
}

export function NewJobForm({
  clients,
  services,
}: {
  clients: NewJobClient[];
  services: NewJobService[];
}) {
  const router = useRouter();
  const [clientId, setClientId] = useState("");
  const [siteId, setSiteId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [durationHours, setDurationHours] = useState("");
  const [cleanerPayAud, setCleanerPayAud] = useState("");
  const [defaultsStatus, setDefaultsStatus] = useState("");
  const [result, setResult] = useState(emptyResult);
  const [busy, setBusy] = useState(false);

  const sites = useMemo(
    () => clients.flatMap((client) => client.sites),
    [clients],
  );

  function selectClient(nextClientId: string) {
    setClientId(nextClientId);
    setSiteId("");
    setServiceId("");
    setDurationHours("");
    setCleanerPayAud("");
    setDefaultsStatus("");
    setResult(emptyResult);
  }

  function selectSite(nextSiteId: string) {
    setSiteId(nextSiteId);
    setResult(emptyResult);
    const site = sites.find((candidate) => candidate.id === nextSiteId);
    if (!site) {
      setServiceId("");
      setDurationHours("");
      setCleanerPayAud("");
      setDefaultsStatus("");
      return;
    }

    setServiceId(site.defaultServiceId ?? "");
    setDurationHours(
      site.defaultDurationMinutes === null
        ? ""
        : String(site.defaultDurationMinutes / 60),
    );
    setCleanerPayAud(
      site.defaultRateCents === null
        ? ""
        : (site.defaultRateCents / 100).toFixed(2),
    );
    setDefaultsStatus(
      site.defaultServiceId === null &&
        site.defaultDurationMinutes === null &&
        site.defaultRateCents === null
        ? `No defaults are set for ${site.name}. Add the job details below.`
        : `Defaults loaded from ${site.name}. You can edit them for this job.`,
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const submitter =
      "submitter" in event.nativeEvent &&
      event.nativeEvent.submitter instanceof HTMLButtonElement
        ? event.nativeEvent.submitter
        : null;
    const formData = new FormData(form);
    formData.set("mode", submitter?.value === "draft" ? "draft" : "post");
    setBusy(true);
    setResult(emptyResult);
    try {
      const nextResult = await createOneOffJob(formData);
      setResult(nextResult);
      if (nextResult.ok && nextResult.jobId) {
        router.push(`/jobs/${nextResult.jobId}`);
      }
    } catch {
      setResult({
        ...emptyResult,
        formError: "The job could not be saved. Please try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="new-job-form" noValidate onSubmit={handleSubmit}>
      <section aria-labelledby="new-job-site-heading" className="new-job-section">
        <div className="new-job-section__heading">
          <p className="record-kicker">Step 1</p>
          <h2 id="new-job-site-heading">Choose the site</h2>
          <p>The client sets the available sites. Site defaults are a starting point only.</p>
        </div>
        <div className="new-job-grid new-job-grid--two">
          <div className="field">
            <label htmlFor="new-job-clientId">Client</label>
            <select
              {...errorProps("clientId", result)}
              id="new-job-clientId"
              name="clientId"
              onChange={(event) => selectClient(event.target.value)}
              value={clientId}
            >
              <option value="">Choose a client</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
            <FieldError
              id="new-job-clientId-error"
              message={result.fieldErrors.clientId}
            />
          </div>
          <div className="field">
            <label htmlFor="new-job-siteId">Site</label>
            <select
              {...errorProps("siteId", result)}
              disabled={!clientId}
              id="new-job-siteId"
              name="siteId"
              onChange={(event) => selectSite(event.target.value)}
              value={siteId}
            >
              <option value="">Choose a site</option>
              {clients.flatMap((client) =>
                client.sites.map((site) => (
                  <option
                    disabled={client.id !== clientId}
                    key={site.id}
                    value={site.id}
                  >
                    {site.name} — {site.suburb}
                  </option>
                )),
              )}
            </select>
            <FieldError
              id="new-job-siteId-error"
              message={result.fieldErrors.siteId}
            />
          </div>
        </div>
        <p className="new-job-defaults-status" role="status">
          {defaultsStatus}
        </p>
      </section>

      <section aria-labelledby="new-job-service-heading" className="new-job-section">
        <div className="new-job-section__heading">
          <p className="record-kicker">Step 2</p>
          <h2 id="new-job-service-heading">Set the service and schedule</h2>
          <p>Times are entered and displayed in Australia/Brisbane.</p>
        </div>
        <div className="new-job-grid new-job-grid--two">
          <div className="field new-job-field--wide">
            <label htmlFor="new-job-serviceId">Service</label>
            <select
              {...errorProps("serviceId", result)}
              id="new-job-serviceId"
              name="serviceId"
              onChange={(event) => setServiceId(event.target.value)}
              value={serviceId}
            >
              <option value="">Choose a service</option>
              {services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name}
                </option>
              ))}
            </select>
            <FieldError
              id="new-job-serviceId-error"
              message={result.fieldErrors.serviceId}
            />
          </div>
          <div className="field">
            <label htmlFor="new-job-date">Job date</label>
            <input
              {...errorProps("date", result)}
              id="new-job-date"
              name="date"
              type="date"
            />
            <FieldError id="new-job-date-error" message={result.fieldErrors.date} />
          </div>
          <div className="field">
            <label htmlFor="new-job-startTime">Start time</label>
            <input
              {...errorProps("startTime", result)}
              id="new-job-startTime"
              name="startTime"
              type="time"
            />
            <FieldError
              id="new-job-startTime-error"
              message={result.fieldErrors.startTime}
            />
          </div>
          <div className="field">
            <label htmlFor="new-job-durationHours">Duration (hours)</label>
            <input
              {...errorProps("durationHours", result)}
              id="new-job-durationHours"
              min="0.25"
              name="durationHours"
              onChange={(event) => setDurationHours(event.target.value)}
              step="0.25"
              type="number"
              value={durationHours}
            />
            <FieldError
              id="new-job-durationHours-error"
              message={result.fieldErrors.durationHours}
            />
          </div>
        </div>
      </section>

      <section aria-labelledby="new-job-commercial-heading" className="new-job-section">
        <div className="new-job-section__heading">
          <p className="record-kicker">Step 3</p>
          <h2 id="new-job-commercial-heading">Set crew and commercial details</h2>
          <p>Cleaner pay is agreed per slot. Client charge and notes stay admin-only.</p>
        </div>
        <div className="new-job-grid new-job-grid--three">
          <div className="field">
            <label htmlFor="new-job-crewSize">Crew size</label>
            <input
              {...errorProps("crewSize", result)}
              defaultValue="1"
              id="new-job-crewSize"
              min="1"
              name="crewSize"
              step="1"
              type="number"
            />
            <FieldError
              id="new-job-crewSize-error"
              message={result.fieldErrors.crewSize}
            />
          </div>
          <div className="field">
            <label htmlFor="new-job-cleanerPayAud">Cleaner pay per slot (AUD)</label>
            <input
              {...errorProps("cleanerPayAud", result)}
              id="new-job-cleanerPayAud"
              inputMode="decimal"
              min="0.01"
              name="cleanerPayAud"
              onChange={(event) => setCleanerPayAud(event.target.value)}
              step="0.01"
              type="number"
              value={cleanerPayAud}
            />
            <FieldError
              id="new-job-cleanerPayAud-error"
              message={result.fieldErrors.cleanerPayAud}
            />
          </div>
          <div className="field">
            <label htmlFor="new-job-clientChargeAud">
              Client charge (AUD, admin only)
            </label>
            <input
              {...errorProps("clientChargeAud", result)}
              id="new-job-clientChargeAud"
              inputMode="decimal"
              min="0.01"
              name="clientChargeAud"
              step="0.01"
              type="number"
            />
            <FieldError
              id="new-job-clientChargeAud-error"
              message={result.fieldErrors.clientChargeAud}
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="new-job-notes">Internal notes (admin only)</label>
          <textarea
            {...errorProps("notes", result)}
            id="new-job-notes"
            maxLength={2000}
            name="notes"
            placeholder="Add operational context for company admins"
            rows={4}
          />
          <FieldError id="new-job-notes-error" message={result.fieldErrors.notes} />
        </div>
      </section>

      <div className="new-job-submit">
        <div aria-live="polite">
          {result.formError ? (
            <p className="form-error" role="alert">
              {result.formError}
            </p>
          ) : (
            <p className="new-job-submit__hint">
              Drafts stay private. Posting creates one vacancy per open crew slot.
            </p>
          )}
        </div>
        <div className="new-job-submit__actions">
          <button
            className="button button--secondary"
            disabled={busy}
            name="mode"
            type="submit"
            value="draft"
          >
            {busy ? "Saving…" : "Save draft"}
          </button>
          <button
            className="button"
            disabled={busy}
            name="mode"
            type="submit"
            value="post"
          >
            {busy ? "Posting…" : "Post to pool"}
          </button>
        </div>
      </div>
    </form>
  );
}
