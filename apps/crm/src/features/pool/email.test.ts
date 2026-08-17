import { describe, expect, it } from "vitest";

import { buildPoolInviteEmail } from "./email";

const input = {
  companyName: "Coastal <Cleaners>",
  joinUrl: "https://cleaner.example.test/join?code=AB12CD&source=email",
};

describe("CLE-79 invitation email copy", () => {
  it("builds the approved en-AU one-time invitation", () => {
    const message = buildPoolInviteEmail({ ...input, locale: "en-AU" });

    expect(message.subject).toBe("Join Coastal <Cleaners>'s cleaner pool");
    expect(message.text).toContain(input.joinUrl);
    expect(message.text).toContain("If you were not expecting this invitation");
    expect(message.html).toContain("Coastal &lt;Cleaners&gt;");
    expect(message.html).not.toContain("unsubscribe");
  });

  it("builds the approved pt-BR one-time invitation", () => {
    const message = buildPoolInviteEmail({ ...input, locale: "pt-BR" });

    expect(message.subject).toBe(
      "Entre para o banco de profissionais da empresa Coastal <Cleaners>",
    );
    expect(message.text).toContain(input.joinUrl);
    expect(message.text).toContain("Se você não esperava este convite");
    expect(message.html).toContain("Coastal &lt;Cleaners&gt;");
  });
});
