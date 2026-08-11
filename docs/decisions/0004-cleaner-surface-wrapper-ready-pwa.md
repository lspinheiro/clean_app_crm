# Cleaner app: wrapper-ready PWA now; a store shell only on evidence

`apps/cleaner` ships as an installable PWA with Web Push (PRODUCT.md §4.1, F11).
Acquisition is structurally web: a share-link candidate must go from group post to
registered with the job open in under a minute (CL-7, ≥40% tap→registration), so no store
install can ever sit in that path — a packaged app is a retention surface for cleaners
already in pools, never the front door.

To keep the store path a bolt-on instead of a migration, the app is **client-first and
static-exportable** from its first commit:

- No server-rendering dependencies: all data through the client Supabase SDK against the
  cleaner views and RPCs (already the mandated access pattern); no server actions, no
  dynamic route handlers.
- Client-side auth (PKCE, local session), not the SSR cookie pattern — the fork that is
  painful to reverse later.
- Push registration behind one small abstraction module — the only code that differs
  between Web Push and native push.
- App-shell offline caching via service worker (offline job cards are wanted regardless).

Escalation ladder, gated on alpha evidence (does iOS web push reach real cleaners'
iPhones reliably?): (1) PWA as-is; (2) a Capacitor shell distributed via TestFlight and
the Play internal track to the cohort — no public review in the loop; (3) public store
listings (Capacitor: native APNs/FCM push, camera plugin for F14 photos), clearing
Apple's minimum-functionality rule via push/camera/offline; JS assets stay OTA-updatable
within store rules.

Considered and rejected: **Electron** (desktop-only; cleaners are phone-only) and
**Tauri** (desktop-first, mobile support young, and a Rust toolchain in a TypeScript
monorepo — with no size/memory advantage inside mobile system webviews). **Flutter**
rejected as the native path: Dart shares nothing with the monorepo (generated Supabase
types, zod schemas, DESIGN.md tokens), and its one-codebase advantage is neutralised
because Flutter Web is wrong for the link-tap funnel, so web stays Next.js regardless.
If native is ever justified — a validated capability gap (background geolocation, heavy
offline) or a dedicated mobile developer joining — the path to argue is **Expo/React
Native** (TypeScript, reuses the monorepo's types and client), then, not now.

`apps/crm` is unaffected: web-only, keeps SSR freedom; admin field use is the responsive
PWA on the phone.
