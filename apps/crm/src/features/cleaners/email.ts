import type { AppLocale } from "@/i18n/config";
import type { PostingIntent } from "@/features/postings/types";

type CleanerInviteEmailInput = {
  companyName: string;
  intent: PostingIntent;
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
  intent,
  joinUrl,
  locale,
}: CleanerInviteEmailInput): CleanerInviteEmail {
  const safeJoinUrl = escapeHtml(joinUrl);

  if (locale === "pt-BR") {
    const isExpressionOfInterest = intent === "expression_of_interest";
    const subject = isExpressionOfInterest
      ? `Entre para a equipe de limpeza da empresa ${companyName}`
      : `Oportunidade de trabalho com ${companyName}`;
    const introduction = isExpressionOfInterest
      ? `${companyName} convidou você para manifestar interesse em entrar na equipe de limpeza da empresa no The Clean Crew.`
      : `${companyName} convidou você para ver e se candidatar a uma oportunidade de limpeza no The Clean Crew.`;
    return {
      subject,
      text: [
        introduction,
        "",
        `Abra o anúncio: ${joinUrl}`,
        "",
        "Este anúncio foi enviado a um profissional atual que espera recebê-lo.",
        "Se você não esperava esta mensagem, ignore este e-mail ou responda à empresa.",
      ].join("\n"),
      html: `<p>${escapeHtml(introduction)}</p><p><a href="${safeJoinUrl}">Abrir anúncio</a></p><p>Este anúncio foi enviado a um profissional atual que espera recebê-lo.</p><p>Se você não esperava esta mensagem, ignore este e-mail ou responda à empresa.</p>`,
    };
  }

  const isExpressionOfInterest = intent === "expression_of_interest";
  const subject = isExpressionOfInterest
    ? `Join ${companyName}'s Cleaner staff`
    : `Cleaning opportunity with ${companyName}`;
  const introduction = isExpressionOfInterest
    ? `${companyName} invited you to express interest in joining its Cleaner staff in The Clean Crew.`
    : `${companyName} invited you to view and apply for a cleaning opportunity in The Clean Crew.`;
  return {
    subject,
    text: [
      introduction,
      "",
      `Open the posting: ${joinUrl}`,
      "",
      "This posting was sent to an existing worker who expects it.",
      "If you were not expecting this message, ignore this email or reply to the company.",
    ].join("\n"),
    html: `<p>${escapeHtml(introduction)}</p><p><a href="${safeJoinUrl}">Open posting</a></p><p>This posting was sent to an existing worker who expects it.</p><p>If you were not expecting this message, ignore this email or reply to the company.</p>`,
  };
}
