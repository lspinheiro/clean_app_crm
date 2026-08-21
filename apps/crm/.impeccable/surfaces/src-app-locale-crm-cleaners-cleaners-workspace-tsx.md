---
version: 1
slug: "src-app-locale-crm-cleaners-cleaners-workspace-tsx"
primary_target: "apps/crm/src/app/[locale]/(crm)/cleaners/cleaners-workspace.tsx"
related_targets: ["apps/crm/src/app/[locale]/(crm)/cleaners/cleaner-email-invite.tsx"]
---

# Cleaner staff invitation workspace

- **Scope / mode:** CRM `/cleaners` surface; Operate.
- **Audience and job:** a cleaning-company administrator invites existing Cleaner staff through one active invitation and confirms who has joined.
- **Primary task:** preview one invitation, then share it through WhatsApp, copy, or email without having to interpret separate link/code/message concepts.
- **Product language:** public copy says **Staff** or **Cleaner staff**; internal `pool` identifiers remain implementation vocabulary only.
- **Approved direction:** `.impeccable/mocks/pool-redesign-a-guided-workspace.png`, blended with composition C's compact active-invitation status bar.
- **Hierarchy:** current invitation status → message preview → one primary WhatsApp action and two secondary channels → collapsed invite details / replacement → Cleaner staff list.
- **Memorable moment:** the invitation reads like the message the administrator will actually send; credentials are calm supporting details.
- **Safety:** replacing an invitation is protected by a focused confirmation and clearly states that the current link stops working.
- **Responsive rule:** sharing actions stack cleanly; disclosure headers become full-width rows; the email workflow remains progressively disclosed.
- **Component grammar:** Trust Blue, restrained white surfaces, 1px slate borders, 8px controls, 12px cards, no nested card chrome; status colour is semantic and paired with text.
- **Inventory:** navigation and page heading (existing semantic HTML); compact active status bar (HTML/CSS + Lucide); message preview (semantic HTML/CSS); WhatsApp/copy/email actions (existing behaviours); invite-details disclosure and confirmation dialog (HTML/CSS/React); active Cleaner staff list with distinctive initials (HTML/CSS); generated comp is reference only, not shipped raster UI.
- **Unresolved:** provider acceptance remains distinct from verified delivery; this slice fixes wording and repeat-send clarity but does not add delivery webhooks or an invitation-history schema.
