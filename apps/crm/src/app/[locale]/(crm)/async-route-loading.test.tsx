import { render } from "@testing-library/react";
import type { ComponentType } from "react";
import { afterEach, describe, expect, it } from "vitest";

import type { AppLocale } from "@/i18n/config";

import CleanersLoading from "./cleaners/loading";
import ClientDetailLoading from "./clients/[clientId]/loading";
import ClientImportLoading from "./clients/import/loading";
import ClientsLoading from "./clients/loading";
import JobDetailLoading from "./jobs/[jobId]/loading";
import JobsLoading from "./jobs/loading";
import NewJobLoading from "./jobs/new/loading";
import MoneyLoading from "./money/loading";
import RosterLoading from "./roster/loading";
import SettingsLoading from "./settings/loading";

const loadingBoundaries: Record<string, ComponentType> = {
  "./cleaners/loading.tsx": CleanersLoading,
  "./clients/[clientId]/loading.tsx": ClientDetailLoading,
  "./clients/import/loading.tsx": ClientImportLoading,
  "./clients/loading.tsx": ClientsLoading,
  "./jobs/[jobId]/loading.tsx": JobDetailLoading,
  "./jobs/loading.tsx": JobsLoading,
  "./jobs/new/loading.tsx": NewJobLoading,
  "./money/loading.tsx": MoneyLoading,
  "./roster/loading.tsx": RosterLoading,
  "./settings/loading.tsx": SettingsLoading,
};

const routeContracts = [
  {
    path: "./clients/loading.tsx",
    labels: { "en-AU": "Loading clients", "pt-BR": "Carregando clientes" },
    geometry: [
      [".clients-loading__card", 2],
      [".clients-loading__site-row", 4],
    ],
  },
  {
    path: "./clients/[clientId]/loading.tsx",
    labels: { "en-AU": "Loading client record", "pt-BR": "Carregando cadastro do cliente" },
    geometry: [
      [".client-detail-loading__site-card", 2],
      [".client-detail-loading__fact", 3],
    ],
  },
  {
    path: "./clients/import/loading.tsx",
    labels: { "en-AU": "Loading client import", "pt-BR": "Carregando importação de clientes" },
    geometry: [
      [".import-loading__template", 2],
      [".import-loading__picker-column", 2],
    ],
  },
  {
    path: "./jobs/loading.tsx",
    labels: { "en-AU": "Loading jobs", "pt-BR": "Carregando trabalhos" },
    geometry: [[".jobs-loading__row", 4]],
  },
  {
    path: "./jobs/new/loading.tsx",
    labels: { "en-AU": "Loading new job", "pt-BR": "Carregando novo trabalho" },
    geometry: [[".new-job-loading__section", 3]],
  },
  {
    path: "./jobs/[jobId]/loading.tsx",
    labels: { "en-AU": "Loading job details", "pt-BR": "Carregando detalhes do trabalho" },
    geometry: [[".job-detail-loading__section", 4]],
  },
  {
    path: "./money/loading.tsx",
    labels: { "en-AU": "Loading money records", "pt-BR": "Carregando registros financeiros" },
    geometry: [
      [".money-loading__total", 2],
      [".money-loading__row", 4],
      [".money-loading__cell", 20],
    ],
  },
  {
    path: "./cleaners/loading.tsx",
    labels: { "en-AU": "Loading cleaners", "pt-BR": "Carregando equipe de limpeza" },
    geometry: [[".cleaners-loading__card", 2]],
  },
  {
    path: "./settings/loading.tsx",
    labels: { "en-AU": "Loading settings", "pt-BR": "Carregando configurações" },
    geometry: [
      [".settings-loading__card", 4],
      [".settings-loading__row", 3],
    ],
  },
  {
    path: "./roster/loading.tsx",
    labels: { "en-AU": "Loading roster", "pt-BR": "Carregando escala" },
    geometry: [[".roster-loading__row", 6]],
  },
] as const;

function setLocale(locale: AppLocale) {
  (globalThis as { __CRM_TEST_LOCALE__?: AppLocale }).__CRM_TEST_LOCALE__ = locale;
}

afterEach(() => setLocale("en-AU"));

describe("async CRM route loading boundaries", () => {
  it("reserves both client-detail metadata lines", () => {
    const { container: clientDetail } = render(<ClientDetailLoading />);
    expect(
      clientDetail.querySelectorAll(".client-detail-header .route-loading__description"),
    ).toHaveLength(2);
  });

  it("preserves the import picker's heading row span", () => {
    const { container: clientImport } = render(<ClientImportLoading />);
    expect(
      clientImport.querySelector(".import-picker > .import-loading__picker-heading"),
    ).toBeInTheDocument();
  });

  it("pins every jobs pay skeleton to the responsive pay column", () => {
    const { container: jobs } = render(<JobsLoading />);
    expect(jobs.querySelectorAll(".jobs-loading__row .job-pay")).toHaveLength(4);
  });

  it("does not reserve a settings description that never renders", () => {
    const { container: settings } = render(<SettingsLoading />);
    expect(
      settings.querySelector(".page-header-row .route-loading__description"),
    ).not.toBeInTheDocument();
  });

  it.each(routeContracts)("provides an accessible, inert boundary for $path", ({ path, labels }) => {
    const Loading = loadingBoundaries[path];
    expect(Loading, `${path} must export a loading boundary`).toBeDefined();
    if (!Loading) return;

    const { container } = render(<Loading />);
    const main = container.querySelector("main");
    expect(main).toHaveAttribute("aria-busy", "true");
    expect(main).toHaveAttribute("aria-label", labels["en-AU"]);
    expect(main?.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
    expect(
      main?.querySelector("a, button, input, select, textarea, [tabindex]"),
    ).not.toBeInTheDocument();
  });

  it.each(routeContracts)("preserves the declared macro-geometry for $path", ({ path, geometry }) => {
    const Loading = loadingBoundaries[path];
    expect(Loading, `${path} must export a loading boundary`).toBeDefined();
    if (!Loading) return;

    const { container } = render(<Loading />);
    for (const [selector, count] of geometry) {
      expect(container.querySelectorAll(selector), selector).toHaveLength(count);
    }
  });

  it.each(routeContracts)("localises the busy announcement for $path", ({ path, labels }) => {
    setLocale("pt-BR");
    const Loading = loadingBoundaries[path];
    expect(Loading, `${path} must export a loading boundary`).toBeDefined();
    if (!Loading) return;

    const { container } = render(<Loading />);
    expect(container.querySelector("main")).toHaveAttribute("aria-label", labels["pt-BR"]);
  });
});
