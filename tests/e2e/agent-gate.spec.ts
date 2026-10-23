import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

// Spec 0004, AC-8: every page under `app/dashboard` calls `requireAgent()`
// itself, because layouts do not rerun on client navigation. A lint rule can't
// tell, so this scan fails when a page file does not import it.

function pageFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return pageFiles(path);
    return /^page\.(t|j)sx?$/.test(entry.name) ? [path] : [];
  });
}

test("every dashboard page imports requireAgent (AC-8)", () => {
  const pages = pageFiles(join(process.cwd(), "app", "dashboard"));
  expect(pages.length).toBeGreaterThan(0);
  const unguarded = pages.filter((file) => {
    const source = readFileSync(file, "utf8");
    return !/import\s*\{[^}]*\brequireAgent\b[^}]*\}\s*from\s*["']@\/lib\/server\/auth["']/.test(source);
  });
  expect(unguarded).toEqual([]);
});
