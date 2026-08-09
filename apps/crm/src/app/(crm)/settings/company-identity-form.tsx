"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState } from "react";

import { updateCompanyIdentity } from "@/app/actions/company";
import { compressCompanyLogo } from "@/features/company-identity/compress-logo";
import {
  parseCompanyIdentity,
  type CompanyIdentityFieldErrors,
} from "@/features/company-identity/schema";

type CompanyIdentityFormProps = {
  company: {
    name: string;
    abn: string;
    timezone: string;
  };
  logoUrl: string | null;
};

export function CompanyIdentityForm({ company, logoUrl }: CompanyIdentityFormProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fieldErrors, setFieldErrors] = useState<CompanyIdentityFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(logoUrl);

  useEffect(() => {
    return () => {
      if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function handleLogoSelection(file: File | undefined) {
    setSaved(false);
    setFieldErrors((current) => ({ ...current, logo: undefined }));
    if (!file) {
      setPreviewUrl(logoUrl);
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setFieldErrors((current) => ({
        ...current,
        logo: "Choose a PNG, JPEG, or WebP image.",
      }));
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setPreviewUrl(URL.createObjectURL(file));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaved(false);
    setFormError(null);

    const payload = new FormData(event.currentTarget);
    const parsed = parseCompanyIdentity({
      name: String(payload.get("name") ?? ""),
      abn: String(payload.get("abn") ?? ""),
    });
    if (!parsed.data) {
      setFieldErrors(parsed.fieldErrors);
      return;
    }

    setBusy(true);
    setFieldErrors({});
    try {
      const selectedLogo = fileInputRef.current?.files?.[0];
      payload.delete("logo");
      if (selectedLogo) {
        const compressedLogo = await compressCompanyLogo(selectedLogo);
        payload.append("logo", compressedLogo);
      }

      const result = await updateCompanyIdentity(payload);
      setFieldErrors(result.fieldErrors);
      setFormError(result.formError);
      if (result.ok) {
        setSaved(true);
        if (fileInputRef.current) fileInputRef.current.value = "";
        router.refresh();
      }
    } catch (error) {
      setFieldErrors({
        logo: error instanceof Error ? error.message : "The logo could not be prepared.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="settings-form" onSubmit={handleSubmit} noValidate>
      <section className="settings-card" aria-labelledby="business-identity-heading">
        <h2 id="business-identity-heading">Business identity</h2>
        <div className="identity-grid">
          <div className="form-stack">
            <div className="field">
              <label htmlFor="company-name">Company name</label>
              <input
                aria-describedby={fieldErrors.name ? "company-name-error" : undefined}
                aria-invalid={Boolean(fieldErrors.name)}
                defaultValue={company.name}
                id="company-name"
                name="name"
                onChange={() => setSaved(false)}
                type="text"
                autoComplete="organization"
              />
              {fieldErrors.name ? (
                <span className="field-error" id="company-name-error" role="alert">
                  {fieldErrors.name}
                </span>
              ) : null}
            </div>
            <div className="field">
              <label htmlFor="company-abn">ABN</label>
              <input
                aria-describedby={fieldErrors.abn ? "company-abn-error" : "company-abn-hint"}
                aria-invalid={Boolean(fieldErrors.abn)}
                defaultValue={company.abn}
                id="company-abn"
                inputMode="numeric"
                name="abn"
                onChange={() => setSaved(false)}
                type="text"
              />
              {fieldErrors.abn ? (
                <span className="field-error" id="company-abn-error" role="alert">
                  {fieldErrors.abn}
                </span>
              ) : (
                <span className="field-hint" id="company-abn-hint">
                  11 digits, as registered
                </span>
              )}
            </div>
          </div>

          <div className="logo-field">
            <div className="logo-preview">
              {previewUrl ? (
                <Image
                  alt={`${company.name} logo`}
                  fill
                  sizes="96px"
                  src={previewUrl}
                  unoptimized
                />
              ) : (
                <span aria-hidden="true">CA</span>
              )}
            </div>
            <label className="logo-upload" htmlFor="company-logo">
              Upload logo
            </label>
            <input
              accept="image/png,image/jpeg,image/webp"
              className="visually-hidden"
              id="company-logo"
              name="logo"
              onChange={(event) => handleLogoSelection(event.target.files?.[0])}
              ref={fileInputRef}
              type="file"
            />
            {fieldErrors.logo ? (
              <span className="field-error logo-error" role="alert">
                {fieldErrors.logo}
              </span>
            ) : null}
          </div>
        </div>
        <p className="timezone-row">Timezone · {company.timezone}</p>
      </section>

      <div className="settings-actions" aria-live="polite">
        <span className="save-status">{saved ? "Saved" : ""}</span>
        <button className="button" disabled={busy} type="submit">
          {busy ? "Saving…" : "Save changes"}
        </button>
      </div>
      {formError ? (
        <p className="form-error settings-form-error" role="alert">
          {formError}
        </p>
      ) : null}
    </form>
  );
}
