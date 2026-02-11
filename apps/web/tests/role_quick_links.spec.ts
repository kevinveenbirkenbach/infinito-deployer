import { test, expect } from "@playwright/test";

const roles = [
  {
    id: "role-all",
    display_name: "Role All",
    status: "stable",
    description: "Role with all quick links.",
    deployment_targets: ["server"],
    documentation: "https://example.com/docs",
    video: "https://youtu.be/dQw4w9WgXcQ",
    forum: "https://forum.example.com",
    homepage: "https://example.com",
    issue_tracker_url: "https://example.com/issues",
    license_url: "https://example.com/license",
  },
  {
    id: "role-partial",
    display_name: "Role Partial",
    status: "beta",
    description: "Role with a single link.",
    deployment_targets: ["workstation"],
    documentation: "https://example.com/partial-docs",
  },
];

test.beforeEach(async ({ page }) => {
  await page.route("**/api/roles**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(roles),
    });
  });
});

test("renders quick link icons and video modal", async ({ page }) => {
  await page.goto("/");

  const roleAll = page.locator("article", { hasText: "Role All" });
  await expect(roleAll).toBeVisible();

  await expect(
    roleAll.getByLabel("Documentation", { exact: true })
  ).toBeVisible();
  await expect(roleAll.getByLabel("Video", { exact: true })).toBeVisible();
  await expect(roleAll.getByLabel("Forum", { exact: true })).toBeVisible();
  await expect(roleAll.getByLabel("Homepage", { exact: true })).toBeVisible();
  await expect(roleAll.getByLabel("Issues", { exact: true })).toBeVisible();
  await expect(roleAll.getByLabel("License", { exact: true })).toBeVisible();

  const docsLink = roleAll.getByLabel("Documentation", { exact: true });
  await expect(docsLink).toHaveAttribute("target", "_blank");

  await roleAll.getByLabel("Video", { exact: true }).click();
  await expect(page.locator("iframe")).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.locator("iframe")).toHaveCount(0);

  const rolePartial = page.locator("article", { hasText: "Role Partial" });
  await expect(rolePartial).toBeVisible();
  await expect(
    rolePartial.getByLabel("Documentation", { exact: true })
  ).toBeVisible();
  await expect(rolePartial.getByLabel("Video", { exact: true })).toHaveCount(0);
});
