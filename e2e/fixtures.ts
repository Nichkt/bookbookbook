import { test as base, expect, type Locator, type Page } from "@playwright/test"

/** What src/app/devHooks.ts puts on `window.__bbb` in development builds, which these tests run against. */
export interface DevHooks {
  db: { getAll<T>(sql: string, parameters?: unknown[]): Promise<T[]> }
  openScenes(): string[]
  flushAll(): Promise<void>
  compactAll(): Promise<void>
}

declare global {
  interface Window {
    __bbb: DevHooks
  }
}

interface EditorElement extends HTMLElement {
  editor: { commands: { focus(position: "start" | "end"): boolean } }
}

/** Fails any test whose page logs an error or throws. Each test gets a fresh profile, so the sample book seeds. */
export const test = base.extend<{ pageErrors: string[] }>({
  pageErrors: [
    async ({ page }, use) => {
      const errors: string[] = []
      page.on("pageerror", (error) => errors.push(error.message))
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text())
      })
      await use(errors)
      expect(errors, "errors logged by the page").toEqual([])
    },
    { auto: true },
  ],
})
export { expect }

/** Opens the app at "/" and follows it to the first chapter. Returns the first scene's text box. */
export async function openFirstChapter(page: Page): Promise<Locator> {
  await page.goto("/")
  await page.waitForURL(/\/b\/[^/]+\/write\/[^/]+$/)
  const editor = page.getByRole("textbox", { name: "Ferry wake" })
  await expect(editor).toBeVisible()
  return editor
}

/** Puts the caret at the end of a scene. Clicking works too, but ProseMirror reads the new selection a task later. */
export async function focusEnd(editor: Locator) {
  await editor.evaluate((element) => (element as EditorElement).editor.commands.focus("end"))
  await expect(editor).toBeFocused()
}

/** Resolves once every edit in the page has been written to SQLite. */
export const flushAll = (page: Page) => page.evaluate(() => window.__bbb.flushAll())
