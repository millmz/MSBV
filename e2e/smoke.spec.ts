import { expect, test } from "@playwright/test";

test("boots, gates, logs in, and shows the app shell", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByPlaceholder("Password")).toBeVisible();

  // Wrong password bounces.
  await page.getByPlaceholder("Password").fill("nope");
  await page.getByRole("button", { name: "Let me in" }).click();
  await expect(page.getByText("Wrong password")).toBeVisible();

  // Right password lands on the dashboard shell.
  await page.getByPlaceholder("Password").fill("e2e-password");
  await page.getByRole("button", { name: "Let me in" }).click();
  await expect(page.getByText("Welcome to MSBV")).toBeVisible();

  // Tab bar navigates; with no league connected, pages show their empty states.
  await page.getByRole("link", { name: "🎯 Draft" }).click();
  await expect(page.getByText("No league selected")).toBeVisible();
  await page.getByRole("link", { name: "⚙️ Setup" }).click();
  await expect(page.getByText("ESPN league")).toBeVisible();
  await expect(page.getByText("Yahoo league")).toBeVisible();
  await expect(page.getByRole("button", { name: "Connect ESPN" })).toBeVisible();
});
