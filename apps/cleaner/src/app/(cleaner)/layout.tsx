import { requireCleaner } from "@/lib/auth/session";

export default async function CleanerLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireCleaner();
  return children;
}
