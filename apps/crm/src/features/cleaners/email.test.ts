import { describe, expect, it } from "vitest";

import { buildCleanerInviteEmail } from "./email";

const input = {
  companyName: "Coastal <Cleaners>",
  intent: "one_time" as const,
  joinUrl: "https://cleaner.example.test/join?code=AB12CD&source=email",
};

describe("CLE-79 invitation email copy", () => {
  it("builds the approved en-AU one-time posting email", () => {
    const message = buildCleanerInviteEmail({ ...input, locale: "en-AU" });

    expect(message.subject).toBe("Cleaning opportunity with Coastal <Cleaners>");
    expect(message.text).toContain(input.joinUrl);
    expect(message.text).toContain("If you were not expecting this message");
    expect(message.html).toContain("Coastal &lt;Cleaners&gt;");
    expect(message.html).not.toContain("unsubscribe");
  });

  it("builds the approved pt-BR one-time posting email", () => {
    const message = buildCleanerInviteEmail({ ...input, locale: "pt-BR" });

    expect(message.subject).toBe(
      "Oportunidade de trabalho com Coastal <Cleaners>",
    );
    expect(message.text).toContain(input.joinUrl);
    expect(message.text).toContain("Se você não esperava esta mensagem");
    expect(message.html).toContain("Coastal &lt;Cleaners&gt;");
  });
});
