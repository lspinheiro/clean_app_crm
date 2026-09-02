export function isInAppBrowser(userAgent: string): boolean {
  return /\b(WhatsApp|FBAN|FBAV|Instagram|Line\/|wv)\b/i.test(userAgent);
}
