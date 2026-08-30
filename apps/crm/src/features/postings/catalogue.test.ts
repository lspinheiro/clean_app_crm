import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import enAu from "../../../messages/en-AU.json";
import ptBr from "../../../messages/pt-BR.json";

const retiredCleanerKeys = [
  "activeCodeNotConfirmed",
  "activeInvitation",
  "confirmReplaceInvitation",
  "copyInvite",
  "copyLink",
  "copySignupLink",
  "copying",
  "copyingInvite",
  "copyingSignup",
  "createInvitation",
  "emailNoNewSend",
  "emailPreviouslyQueuedCount",
  "emailQueuedNowCount",
  "eyebrow",
  "generateBeforeSharing",
  "generateCode",
  "generating",
  "generatingCode",
  "hideInviteDetails",
  "inviteCode",
  "inviteCopied",
  "inviteCopyFailed",
  "inviteDescription",
  "inviteDetails",
  "inviteMessage",
  "inviteMessagePreview",
  "inviteStatusLabel",
  "inviteTitle",
  "keepInvitation",
  "newCodeGenerated",
  "noActiveInvitation",
  "noCode",
  "reloadingInvite",
  "replaceInvitation",
  "replaceInviteDescription",
  "replaceInviteTitle",
  "rotationNote",
  "shareOnWhatsApp",
  "sharedInviteHint",
  "signupCopied",
  "signupCopyFailed",
  "signupLink",
] as const;

describe("CLE-60 posting catalogue", () => {
  it.each([
    ["en-AU", enAu],
    ["pt-BR", ptBr],
  ] as const)("contains no retired rotating-invitation copy in %s", (_locale, messages) => {
    expect(messages.Postings).not.toHaveProperty("postingCount");
    for (const key of retiredCleanerKeys) {
      expect(messages.Cleaners).not.toHaveProperty(key);
    }
    expect(messages.UserMessages).not.toHaveProperty("inviteRotateFailed");
    expect(messages.UserMessages).not.toHaveProperty("cleanerEmailRecordFailed");
  });

  it("uses a natural zero-application branch in both locales", () => {
    const en = createTranslator({ locale: "en-AU", messages: enAu });
    const pt = createTranslator({ locale: "pt-BR", messages: ptBr });

    expect(en("Postings.applications", { count: 0 })).toBe("No applications");
    expect(pt("Postings.applications", { count: 0 })).toBe("Nenhuma candidatura");
  });
});
