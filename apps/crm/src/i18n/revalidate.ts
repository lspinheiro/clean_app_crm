import { revalidatePath } from "next/cache";

import { locales } from "./config";

export function revalidateLocalizedPath(
  path: string,
  type?: "layout" | "page",
) {
  if (path === "/") {
    if (type) revalidatePath(path, type);
    else revalidatePath(path);
    return;
  }

  for (const locale of locales) {
    const localizedPath = `/${locale}${path}`;
    if (type) revalidatePath(localizedPath, type);
    else revalidatePath(localizedPath);
  }
}
