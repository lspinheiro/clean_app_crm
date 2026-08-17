import { revalidatePath } from "next/cache";

import { locales } from "./config";

export function revalidateLocalizedPath(
  path: string,
  type?: "layout" | "page",
) {
  if (type) revalidatePath(path, type);
  else revalidatePath(path);

  for (const locale of locales) {
    const localizedPath = path === "/" ? `/${locale}` : `/${locale}${path}`;
    if (type) revalidatePath(localizedPath, type);
    else revalidatePath(localizedPath);
  }
}
