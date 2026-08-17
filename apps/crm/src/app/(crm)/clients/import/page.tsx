import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { ImportWorkspace } from "./import-workspace";

import type { ExistingImportClient } from "@/features/import/csv";
import { Link } from "@/i18n/navigation";
import { requireCompanyAdmin } from "@/lib/auth/session";

const pageSize = 1_000;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Metadata");
  return { title: t("import") };
}

type Supabase = Awaited<
  ReturnType<typeof requireCompanyAdmin>
>["supabase"];

async function loadClients(supabase: Supabase, companyId: string) {
  const clients: { id: string; name: string }[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from("clients")
      .select("id, name")
      .eq("company_id", companyId)
      .order("name")
      .order("id")
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    clients.push(...(data ?? []));
    if ((data?.length ?? 0) < pageSize) break;
  }
  return clients;
}

async function loadSites(supabase: Supabase, companyId: string) {
  const sites: { client_id: string; name: string }[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from("sites")
      .select("client_id, name, clients!inner(company_id)")
      .eq("clients.company_id", companyId)
      .order("name")
      .order("id")
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    sites.push(
      ...(data ?? []).map((site) => ({
        client_id: site.client_id,
        name: site.name,
      })),
    );
    if ((data?.length ?? 0) < pageSize) break;
  }
  return sites;
}

export default async function ClientsImportPage() {
  const t = await getTranslations("Import");
  const { company, supabase } = await requireCompanyAdmin();
  const [clientRows, siteRows] = await Promise.all([
    loadClients(supabase, company.id),
    loadSites(supabase, company.id),
  ]);
  const clients: ExistingImportClient[] = clientRows
    .map((client) => ({
      id: client.id,
      name: client.name,
      siteNames: siteRows
        .filter((site) => site.client_id === client.id)
        .map((site) => site.name)
        .sort((left, right) => left.localeCompare(right)),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));

  return (
    <main className="page-shell import-page">
      <Link className="back-link" href="/clients">
        <ArrowLeft aria-hidden="true" size={18} />
        {t("back")}
      </Link>
      <header className="import-page__header">
        <h1 className="page-heading">{t("title")}</h1>
        <p className="page-description">{t("description")}</p>
      </header>
      <ImportWorkspace clients={clients} />
    </main>
  );
}
