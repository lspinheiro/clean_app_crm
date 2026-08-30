import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

// Runs against the seeded local database (`pnpm db:reset`).
//
// The seed writes no notification rows, so the bell opens on its heading and its empty
// state. That is enough for most of what this file is about: where the panel lands, not
// what it lists. jsdom cannot answer that question — `notification-bell.test.tsx` proves
// the panel's contents and its keyboard behaviour, and neither test can see a box that
// has been laid out off the side of the phone.
const cleanerEmail = "cleaner.two@clean-app.example.test";
const demoPassword = "local-demo-only";

// Seeded ids, so the news the last test writes is real news about a real job.
const cleanerProfileId = "10000000-0000-4000-8000-000000000003";
const seededJobId = "10000000-0000-4000-8000-000000000801";

// The phone widths the app is built for: the narrowest handset still in use, the common
// small Android, this app's design width, and the Pixel-class screen the defect was
// reported on. The panel is placed in CSS alone, so one sign-in carries every width —
// resizing re-runs exactly the layout the phone runs.
const phoneWidths = [320, 360, 390, 412];

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(cleanerEmail);
  await page.getByLabel("Password").fill(demoPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/board$/);
  // Measuring a screen that is still filling in measures a layout no cleaner ever sees:
  // wait for the board this cleaner always has before reading any rectangle off it.
  await expect(
    page.getByRole("list", { name: "Open jobs" }).getByRole("listitem").first(),
  ).toBeVisible();
}

async function openBell(page: Page) {
  await page.getByRole("button", { name: "Notifications" }).click();
  await expect(page.locator(".notification-menu__panel")).toBeVisible();
}

/**
 * The panel, the header it hangs from, and the tab bar it must clear, read in one pass so
 * the three rectangles come from a single layout — and read in the page, so they are the
 * rectangles the browser paints rather than any the driver reconstructs.
 */
async function geometry(page: Page) {
  return page.evaluate(() => {
    function rectOf(selector: string) {
      const element = document.querySelector(selector);
      if (!element) throw new Error(`${selector} is not on the page.`);
      const { x, y, width, height, right, bottom } = element.getBoundingClientRect();
      return { x, y, width, height, right, bottom };
    }
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      header: rectOf(".app-header"),
      panel: rectOf(".notification-menu__panel"),
      tabBar: rectOf(".tab-bar"),
    };
  });
}

test.describe("@CLE-90 the notification panel on a phone", () => {
  test("opens fully on screen at every phone width", async ({ page }) => {
    await signIn(page);
    await openBell(page);

    for (const width of phoneWidths) {
      await page.setViewportSize({ width, height: 915 });
      const { panel } = await geometry(page);

      // The bell sits left of the language switcher and Sign out, so a panel anchored to
      // the bell hangs off the left edge and clips its own text mid-word.
      expect(
        panel.x,
        `panel is off the left edge at ${width}px (x=${panel.x})`,
      ).toBeGreaterThanOrEqual(0);
      expect(
        panel.right,
        `panel is off the right edge at ${width}px (right=${panel.right})`,
      ).toBeLessThanOrEqual(width);
    }
  });

  test("hangs below the header rather than across it", async ({ page }) => {
    await signIn(page);
    await openBell(page);

    const { header, panel } = await geometry(page);

    // Sign out wraps to two lines on narrow phones, so the header is not a fixed 64px.
    // Whatever height it takes, the panel starts under it.
    expect(panel.y).toBeGreaterThanOrEqual(header.bottom);
    // And inside the header's own column, which is what keeps it on screen once the
    // viewport is wider than the 520px shell.
    expect(panel.x).toBeGreaterThanOrEqual(header.x);
    expect(panel.right).toBeLessThanOrEqual(header.right);
  });

  test("stays inside the shell on a screen wider than the app", async ({ page }) => {
    await signIn(page);
    await page.setViewportSize({ width: 900, height: 915 });
    await openBell(page);

    // The shell is a centred 520px column on a wide screen. A panel measured against the
    // viewport instead of the header would float away from the app it belongs to.
    const { header, panel } = await geometry(page);

    expect(panel.x).toBeGreaterThanOrEqual(header.x);
    expect(panel.right).toBeLessThanOrEqual(header.right);
  });

  test("stops above the tab bar when the screen is short and the list is long", async ({
    page,
  }) => {
    // A panel with two items in it clears anything, and the seed writes no notifications
    // at all, so this is the one test that has to supply its own news — with the local
    // secret key the acceptance runner already exports. `run-local-e2e.mjs` resets the
    // database before every run, and these rows are removed again below, so no other
    // spec ever sees them.
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY;
    if (!url || !key) throw new Error("Local Supabase environment is unavailable.");
    const supabase = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error } = await supabase.from("notifications").insert(
      Array.from({ length: 12 }, (_, index) => ({
        recipient_id: cleanerProfileId,
        job_id: seededJobId,
        type: (["job_posted", "job_assigned", "job_cancelled"] as const)[index % 3],
        created_at: new Date(Date.now() - index * 3_600_000).toISOString(),
      })),
    );
    if (error) throw error;

    try {
      // A phone turned sideways: header and tab bar together take a third of the height.
      await page.setViewportSize({ width: 915, height: 412 });
      await signIn(page);
      await openBell(page);

      const list = page.locator(".notification-menu__list");
      await expect(list.getByRole("listitem").first()).toBeVisible();

      // The tab bar is sticky at the same z-index as the header and comes later in the
      // document, so whatever of the panel reaches it is painted over — a notification
      // sliced in half, not one scrolled out of reach.
      const { panel, tabBar } = await geometry(page);
      expect(panel.bottom).toBeLessThanOrEqual(tabBar.y);

      // And the list really is longer than the room it was given, so the line above is
      // passing because the panel is held back, not because there was little to show.
      const overflowing = await list.evaluate(
        (element) => element.scrollHeight > element.clientHeight + 1,
      );
      expect(overflowing).toBe(true);
    } finally {
      await supabase
        .from("notifications")
        .delete()
        .eq("recipient_id", cleanerProfileId)
        .eq("job_id", seededJobId);
    }
  });
});
