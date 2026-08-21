import type { AppLocale } from "@/i18n/config";

type CleanerInviteEmailInput = {
  companyName: string;
  joinUrl: string;
  locale: AppLocale;
};

export type CleanerInviteEmail = {
  html: string;
  subject: string;
  text: string;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function buildCleanerInviteEmail({
  companyName,
  joinUrl,
  locale,
}: CleanerInviteEmailInput): CleanerInviteEmail {
  const safeCompanyName = escapeHtml(companyName);
  const safeJoinUrl = escapeHtml(joinUrl);

  if (locale === "pt-BR") {
    const subject = `Entre para a equipe de limpeza da empresa ${companyName}`;
    return {
      subject,
      text: [
        `${companyName} convidou você para entrar na equipe de limpeza da empresa no The Clean Crew.`,
        "",
        `Abra o convite: ${joinUrl}`,
        "",
        "Este é um convite único para um profissional que já trabalha com a empresa.",
        "Se você não esperava este convite, ignore este e-mail ou responda à empresa.",
      ].join("\n"),
      html: `<p><strong>${safeCompanyName}</strong> convidou você para entrar na equipe de limpeza da empresa no The Clean Crew.</p><p><a href="${safeJoinUrl}">Abrir convite</a></p><p>Este é um convite único para um profissional que já trabalha com a empresa.</p><p>Se você não esperava este convite, ignore este e-mail ou responda à empresa.</p>`,
    };
  }

  const subject = `Join ${companyName}'s Cleaner staff`;
  return {
    subject,
    text: [
      `${companyName} invited you to join its Cleaner staff in The Clean Crew.`,
      "",
      `Open the invitation: ${joinUrl}`,
      "",
      "This is a one-time invitation for an existing worker of the company.",
      "If you were not expecting this invitation, ignore this email or reply to the company.",
    ].join("\n"),
    html: `<p><strong>${safeCompanyName}</strong> invited you to join its Cleaner staff in The Clean Crew.</p><p><a href="${safeJoinUrl}">Open invitation</a></p><p>This is a one-time invitation for an existing worker of the company.</p><p>If you were not expecting this invitation, ignore this email or reply to the company.</p>`,
  };
}
