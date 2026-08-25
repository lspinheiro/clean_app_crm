---
version: 1
slug: "src-app-locale-crm-jobs-jobid-job-detail-workspace-tsx"
primary_target: "apps/crm/src/app/[locale]/(crm)/jobs/[jobId]/job-detail-workspace.tsx"
related_targets: ["apps/crm/src/app/[locale]/(crm)/jobs/jobs-list.tsx", "apps/crm/src/components/notification-bell.tsx"]
---

# Application review workspace

- **Scope / mode:** CRM job detail and its arrival cues; Operate.
- **Audience and job:** a company employee reviews cleaners who already applied, resolves every response, and fills an exact open crew slot without returning to chat.
- **Primary task:** approve one awaiting applicant for a selected open slot; approval assigns immediately because the application is consent.
- **Approved direction:** `.impeccable/mocks/application-approval-a-queue-first.png`; queue-first composition with persistent job and crew context.
- **Hierarchy:** job identity and staffing summary → awaiting application queue → crew progress → resolved responses → separate non-applicant staffing route → operational/commercial detail.
- **Memorable moment:** the selected applicant and exact slot meet in one calm approval decision, with the assignment consequence stated beside the action.
- **State contract:** awaiting, assigned, not selected, withdrawn; Not selected has no reason field and may be restored only while the job is posted with an open slot.
- **Arrival contract:** Jobs shows the live awaiting count; the CRM bell lists a durable application notification and links to `#applications`; ordinary applications do not send admin web push.
- **Responsive rule:** one reading order on desktop and mobile; the queue becomes single-column and every action remains at least 44 px.
- **Component grammar:** Trust Blue, pale-blue active queue, white rows with slate dividers, 8 px controls, 12 px grouping surfaces, status colour paired with text; no applicant score cards or nested dashboard chrome.
- **Boundary:** directly giving work to a non-applicant is not approval and remains a visually separate route; directed offers are not implemented by this slice.
