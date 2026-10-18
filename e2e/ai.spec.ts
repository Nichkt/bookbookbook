import type { Locator, Page } from "@playwright/test"
import {
  expect,
  fakeAi,
  focusEnd,
  LOCAL_AI,
  openBookId,
  openFirstChapter,
  queryDb,
  selectText,
  type SentChat,
  settleAll,
  setUpLocalAi,
  test,
} from "./fixtures"

const OPENAI = "https://api.openai.com/v1"
/** The end of the first scene, where focusEnd puts the caret. */
const SCENE_END = "redraw itself around an absence."
const CHAPTER_SUMMARY =
  "Mara Quill returns to Grayhaven for Thomas's funeral and finds the island smaller, sharper, and less willing to " +
  "forgive absence."
const MOMENTS_SQL = "SELECT text FROM beats WHERE parent_kind = 'chapter' AND parent_id = ? ORDER BY position"

const toast = (page: Page, text: string) => page.locator("[data-sonner-toast]").filter({ hasText: text })
/** The open chapter's id, from the address. */
const chapterIdOf = (page: Page) => new URL(page.url()).pathname.split("/")[4]

const userPrompt = (sent: SentChat) => sent.body.messages[1].content

const LOCAL_ROUTE = "Runs on this computer, with llama3.1. Nothing leaves it."

/** Opens the AI tools beside the text from the toolbar, once they know where they'll send what they read. */
async function openAiPanel(page: Page, route = LOCAL_ROUTE) {
  await page.getByRole("button", { name: "AI tools", exact: true }).click()
  const panel = page.getByRole("complementary", { name: "AI tools" })
  await expect(panel.getByRole("heading", { name: "AI tools" })).toBeFocused()
  if (route) await expect(panel.getByText(route)).toBeVisible()
  return panel
}

async function pickTool(panel: Locator, name: string) {
  const tool = panel.locator("[data-ai-tool]")
  await tool.click()
  await panel.page().getByRole("option", { name, exact: true }).click()
  await expect(tool).toHaveText(name)
}

/** The newest of `count` cards, by its id, so it's still this one once a newer one comes. */
async function newestCard(panel: Locator, count: number) {
  const cards = panel.locator("[data-ai-card]")
  await expect(cards).toHaveCount(count)
  const id = await cards.first().getAttribute("data-ai-card")
  return panel.locator(`[data-ai-card="${id}"]`)
}

/** One of a card's versions, by its text: they're asked for at once, so they may come in any order. */
const version = (card: Locator, text: string) => card.getByRole("region").filter({ hasText: text })

test("sets up a model on this computer, and Ctrl+J continues from the caret into tinted text", async ({ page }) => {
  const ai = await fakeAi(page, LOCAL_AI)
  const editor = await openFirstChapter(page)
  const panel = await openAiPanel(page, "")
  const setup = panel.locator("[data-ai-setup-card]")
  await expect(setup).toContainText("Choose where the AI runs.")
  await expect(panel.locator("[data-ai-share]")).toContainText("AI-written: 0% of this chapter · 0% of the book")

  await setup.getByRole("button", { name: "Set up AI" }).click()
  const settings = page.getByRole("dialog", { name: "AI settings" })
  await settings.getByRole("radio", { name: "On this computer" }).check()
  await expect(settings.getByRole("textbox", { name: "Address" })).toHaveValue(LOCAL_AI)
  await expect(settings.getByRole("button", { name: "Ollama" })).toHaveAttribute("aria-pressed", "true")
  // Checking the connection lists the models to choose from, less the ones that can't write, and picks one.
  await settings.getByRole("button", { name: "Check connection" }).click()
  await expect(settings.locator("[data-ai-check-result]")).toHaveText("Connected. 1 model to choose from.")
  await expect(settings.getByRole("combobox", { name: "Model", exact: true })).toHaveValue("llama3.1")
  await settings.getByRole("button", { name: "Save", exact: true }).click()
  await expect(toast(page, "AI settings saved. The AI tools are ready.")).toBeVisible()
  await expect(setup).toHaveCount(0)
  await expect(panel.getByText(LOCAL_ROUTE)).toBeVisible()

  // Ctrl+J opens the panel and runs Continue, and the caret stays in the text.
  await panel.getByRole("button", { name: "Close panel" }).click()
  await expect(panel).toBeHidden()
  await focusEnd(editor)
  ai.reply("A gull laughed at nothing.", "The tide turned without her.")
  await page.keyboard.press("Control+j")
  const card = await newestCard(panel, 1)
  await expect(card).toHaveAttribute("data-ai-card-status", "done")
  await expect(editor).toBeFocused()
  expect(ai.sent).toHaveLength(2)
  for (const sent of ai.sent) {
    expect(sent.url).toBe(`${LOCAL_AI}/chat/completions`)
    expect(sent.headers.authorization).toBeUndefined()
    expect(sent.body).toMatchObject({ model: "llama3.1", stream: true })
    expect(userPrompt(sent)).toContain(`${SCENE_END}\n</text_before_caret>`)
  }
  expect(await queryDb(page, "SELECT tool, model, route FROM ai_cards WHERE book_id = ?", [openBookId(page)])).toEqual([
    { tool: "continue", model: "llama3.1", route: "local" },
  ])

  // Insert puts it in at the caret, tinted, and goes back to the text.
  await version(card, "A gull laughed at nothing.").getByRole("button", { name: "Insert" }).click()
  const written = editor.locator(".ai-generated")
  await expect(written).toHaveText("A gull laughed at nothing.")
  await expect(editor).toBeFocused()
  await expect(version(card, "A gull laughed at nothing.").getByText("Used")).toBeVisible()
  await expect(version(card, "The tide turned without her.").getByText("Used")).toHaveCount(0)

  // What's typed after it is the writer's own, and the counts tell the two apart.
  await page.keyboard.type(" Mara laughed too.")
  await expect(editor).toContainText(`${SCENE_END} A gull laughed at nothing. Mara laughed too.`)
  await expect(written).toHaveText("A gull laughed at nothing.")
  await settleAll(page)
  expect(await queryDb(page, "SELECT ai_word_count FROM scenes WHERE title = 'Ferry wake'")).toEqual([
    { ai_word_count: 5 },
  ])
  expect(
    await queryDb(
      page,
      "SELECT SUM(words_added) AS added, SUM(ai_words_inserted) AS ai FROM writing_stats WHERE book_id = ?",
      [openBookId(page)],
    ),
  ).toEqual([{ added: 3, ai: 5 }])
  await expect(panel.locator("[data-ai-share]")).toContainText(/AI-written: [1-9]\d*% of this chapter/)

  // The tint can go; the text keeps its mark.
  await expect(written).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)")
  await panel.getByRole("button", { name: "AI settings", exact: true }).click()
  await settings.getByRole("checkbox", { name: "Tint the text the AI wrote" }).uncheck()
  await settings.getByRole("button", { name: "Save", exact: true }).click()
  await expect(settings).toBeHidden()
  await expect(written).toHaveCSS("background-color", "rgba(0, 0, 0, 0)")
  await expect(written).toHaveText("A gull laughed at nothing.")
})

test("Rewrite works on the selection, and Replace swaps in a version as one undo step", async ({ page }) => {
  const ai = await fakeAi(page, LOCAL_AI)
  const editor = await openFirstChapter(page)
  await setUpLocalAi(page)
  const panel = await openAiPanel(page)
  await pickTool(panel, "Rewrite")
  const sentence = "Jonas waited below the crane with his cap pulled low."
  await selectText(editor, sentence)
  await expect(panel.locator("[data-ai-target]")).toHaveText("Works on the 10 words you selected.")

  ai.reply("Jonas stood under the crane, cap low.", "Jonas lingered by the crane.", "Under the crane, Jonas waited.")
  await panel.getByRole("button", { name: "Run Rewrite" }).click()
  const card = await newestCard(panel, 1)
  await expect(card).toHaveAttribute("data-ai-card-status", "done")
  await expect(card.getByRole("region")).toHaveCount(3)
  expect(ai.sent).toHaveLength(3)
  expect(userPrompt(ai.sent[0])).toContain(`<selected_text>\n${sentence}\n</selected_text>`)

  await version(card, "Jonas stood under the crane, cap low.").getByRole("button", { name: "Replace" }).click()
  await expect(editor).not.toContainText(sentence)
  await expect(editor.locator(".ai-generated")).toHaveText("Jonas stood under the crane, cap low.")
  await expect(editor).toBeFocused()

  await page.keyboard.press("Control+z")
  await expect(editor).toContainText(sentence)
  await expect(editor.locator(".ai-generated")).toHaveCount(0)
})

test("Stop ends a run that's waiting, Run again asks the same again, and Clear all can be undone", async ({ page }) => {
  const ai = await fakeAi(page, LOCAL_AI)
  const editor = await openFirstChapter(page)
  await setUpLocalAi(page)
  await focusEnd(editor)
  const panel = await openAiPanel(page)

  ai.hold()
  await panel.getByRole("button", { name: "Run Continue" }).click()
  const stopped = await newestCard(panel, 1)
  await expect(stopped).toHaveAttribute("data-ai-card-status", "running")
  await expect(stopped).toContainText("Waiting for the AI on this computer…")
  await expect.poll(() => ai.sent.length).toBe(2)
  await stopped.getByRole("button", { name: "Stop", exact: true }).click()
  await expect(stopped).toHaveAttribute("data-ai-card-status", "stopped")
  await expect(stopped.getByText("Stopped.")).toBeVisible()
  await expect(stopped.getByText("No answer.")).toHaveCount(2)

  ai.release()
  await stopped.getByRole("button", { name: "Run again" }).click()
  const again = await newestCard(panel, 2)
  await expect(again).toHaveAttribute("data-ai-card-status", "done")
  await expect(version(again, "The tide turned.")).toHaveCount(2)
  expect(ai.sent).toHaveLength(4)
  expect(ai.sent[2].body).toEqual(ai.sent[0].body)
  await expect(stopped).toHaveAttribute("data-ai-card-status", "stopped")

  await panel.getByRole("button", { name: "Clear all" }).click()
  await expect(panel.locator("[data-ai-card]")).toHaveCount(0)
  await expect(panel.getByText("What the tools write shows here, newest first")).toBeVisible()
  await toast(page, "Cleared the results.").getByRole("button", { name: "Undo" }).click()
  await expect(panel.locator("[data-ai-card]")).toHaveCount(2)
})

test("a key OpenAI turns away says so on the card, and Run again uses the key put right", async ({
  page,
  pageErrors,
}) => {
  const ai = await fakeAi(page, OPENAI, { models: ["gpt-5.4-mini"], key: "sk-good-1234" })
  const editor = await openFirstChapter(page)
  await focusEnd(editor)
  const panel = await openAiPanel(page, "")
  await panel.getByRole("button", { name: "Set up AI" }).click()
  const settings = page.getByRole("dialog", { name: "AI settings" })
  await settings.getByRole("radio", { name: "OpenAI" }).check()
  await expect(settings).toContainText("You pay OpenAI for what you use.")
  await expect(settings.getByRole("combobox", { name: "Model", exact: true })).toHaveValue("gpt-5.4-mini")
  await settings.getByLabel("OpenAI API key").fill("sk-bad-9999")
  await settings.getByRole("button", { name: "Save", exact: true }).click()
  await expect(settings).toBeHidden()
  await expect(panel.getByText("Sends what it reads to OpenAI, for gpt-5.4-mini.")).toBeVisible()

  await panel.getByRole("button", { name: "Run Continue" }).click()
  const failed = await newestCard(panel, 1)
  await expect(failed).toHaveAttribute("data-ai-card-status", "error")
  await expect(failed).toContainText("OpenAI didn't accept your API key. Check it in AI settings.")
  const [first] = ai.sent
  expect(first.url).toBe(`${OPENAI}/chat/completions`)
  expect(first.headers.authorization).toBe("Bearer sk-bad-9999")
  expect(first.body).toMatchObject({ model: "gpt-5.4-mini", stream: true, reasoning_effort: "low" })
  expect(first.body.max_completion_tokens).toBeGreaterThan(0)
  expect(first.body.max_tokens).toBeUndefined()

  // The card's own way to AI settings, where the saved key shows only its end.
  await failed.getByRole("button", { name: "AI settings" }).click()
  await expect(settings).toContainText("Saved key: ••••9999")
  await settings.getByLabel("OpenAI API key").fill("sk-good-1234")
  await settings.getByRole("button", { name: "Save", exact: true }).click()
  await expect(settings).toBeHidden()

  const tried = ai.sent.length
  await failed.getByRole("button", { name: "Run again" }).click()
  const fixed = await newestCard(panel, 2)
  await expect(fixed).toHaveAttribute("data-ai-card-status", "done")
  await expect(version(fixed, "The tide turned.")).toHaveCount(2)
  expect(ai.sent.slice(tried).map((sent) => sent.headers.authorization)).toEqual([
    "Bearer sk-good-1234",
    "Bearer sk-good-1234",
  ])

  // Chrome logs each request turned away.
  const turnedAway = pageErrors.filter((error) => error.includes("401"))
  expect(turnedAway.length).toBeGreaterThan(0)
  pageErrors.splice(0, pageErrors.length, ...pageErrors.filter((error) => !turnedAway.includes(error)))
})

test("What the AI sees shows the prompt a run sends, less the parts turned off", async ({ page }) => {
  const ai = await fakeAi(page, LOCAL_AI)
  const editor = await openFirstChapter(page)
  await setUpLocalAi(page)
  await focusEnd(editor)
  const panel = await openAiPanel(page)

  await panel.getByRole("button", { name: "What the AI sees" }).click()
  const preview = panel.getByRole("region", { name: "What the AI sees" })
  const parts = preview.getByRole("list", { name: "What it sends" })
  const text = parts.getByRole("checkbox", { name: "Your text", exact: true })
  await expect(text).toBeChecked()
  await expect(text).toBeDisabled()
  const chapter = parts.getByRole("checkbox", { name: "This chapter's summary and moments" })
  await expect(chapter).toBeChecked()
  await preview.getByRole("button", { name: "The whole prompt" }).click()
  const prompt = preview.locator('pre[aria-label="The whole prompt"]')
  await expect(prompt).toContainText(`# This chapter`)
  await expect(prompt).toContainText(`Summary: ${CHAPTER_SUMMARY}`)

  await chapter.uncheck()
  await expect(prompt).not.toContainText("# This chapter")
  await expect
    .poll(() => queryDb(page, "SELECT value FROM ui_prefs WHERE id = 'ai.slots'"))
    .toEqual([{ value: '["chapter"]' }])

  await panel.getByRole("button", { name: "Run Continue" }).click()
  await expect(await newestCard(panel, 1)).toHaveAttribute("data-ai-card-status", "done")
  const [sent] = ai.sent
  expect(userPrompt(sent)).not.toContain("# This chapter")
  expect(userPrompt(sent)).toContain(SCENE_END)
  expect(await prompt.textContent()).toBe(`${sent.body.messages[0].content}\n\n${userPrompt(sent)}`)
})

test("Brainstorm's ideas go into the chapter as moments, and its characters into the World", async ({ page }) => {
  const ai = await fakeAi(page, LOCAL_AI)
  const editor = await openFirstChapter(page)
  const chapterId = chapterIdOf(page)
  const moments = async () =>
    (await queryDb<{ text: string }>(page, MOMENTS_SQL, [chapterId])).map((moment) => moment.text)
  await setUpLocalAi(page)
  await focusEnd(editor)
  const panel = await openAiPanel(page)
  await pickTool(panel, "Brainstorm")
  const before = await moments()

  ai.reply("1. Mara finds Thomas's ledger in the ferry office.\n2. Jonas admits he sold the boat.")
  await panel.getByRole("button", { name: "Run Brainstorm" }).click()
  const ideas = await newestCard(panel, 1)
  await expect(ideas).toHaveAttribute("data-ai-card-status", "done")
  await expect(ideas.getByRole("listitem")).toHaveCount(2)
  await expect(ideas.getByRole("button", { name: "Add to World" })).toHaveCount(0)
  await ideas
    .getByRole("listitem")
    .filter({ hasText: "Jonas admits he sold the boat." })
    .getByRole("button", { name: "Add as a moment" })
    .click()
  const added = toast(page, "Added a moment to “The Ferry Home”.")
  await expect(added).toBeVisible()
  await expect.poll(moments).toEqual([...before, "Jonas admits he sold the boat."])
  await added.getByRole("button", { name: "Undo" }).click()
  await expect.poll(moments).toEqual(before)

  // Characters come as a name and a note, ready for the World.
  await panel.getByRole("combobox", { name: "Ideas for" }).click()
  await page.getByRole("option", { name: "Characters", exact: true }).click()
  ai.reply("1. Wren Harrow: a ferry pilot who owes Thomas money\n2. Old Sal: keeps the tide book for the harbor")
  await panel.getByRole("button", { name: "Run Brainstorm" }).click()
  const people = await newestCard(panel, 2)
  await expect(people).toHaveAttribute("data-ai-card-status", "done")
  expect(userPrompt(ai.sent[1])).toContain("Brainstorm: characters.")
  await expect(people.getByRole("button", { name: "Add as a moment" })).toHaveCount(0)
  await people
    .getByRole("listitem")
    .filter({ hasText: "Old Sal" })
    .getByRole("button", { name: "Add to World" })
    .click()
  const dialog = page.getByRole("dialog", { name: "Add to World" })
  await expect(dialog.getByRole("textbox", { name: "Name" })).toHaveValue("Old Sal")
  await expect(dialog.getByRole("combobox", { name: "Type" })).toHaveText("Character")
  await expect(dialog.getByRole("textbox", { name: "Notes (optional)" })).toHaveValue(
    "keeps the tide book for the harbor",
  )
  await dialog.getByRole("button", { name: "Add to World" }).click()
  await expect(toast(page, "Added “Old Sal” to the World.")).toBeVisible()
  const [entry] = await queryDb<{ type: string; notes: string }>(
    page,
    `SELECT t.key AS type, e.notes FROM codex_entries e JOIN codex_types t ON t.id = e.type_id
     WHERE e.name = 'Old Sal' AND e.deleted_at IS NULL`,
  )
  expect(entry.type).toBe("characters")
  expect(entry.notes).toContain("keeps the tide book for the harbor")
})

test("Summarize chapter reads the whole chapter, and its summary and moments go into the plan", async ({ page }) => {
  const ai = await fakeAi(page, LOCAL_AI)
  await openFirstChapter(page)
  const chapterId = chapterIdOf(page)
  const moments = async () =>
    (await queryDb<{ text: string }>(page, MOMENTS_SQL, [chapterId])).map((moment) => moment.text)
  await setUpLocalAi(page)
  const panel = await openAiPanel(page)
  await pickTool(panel, "Summarize chapter")
  await expect(panel.locator("[data-ai-target]")).toHaveText("Reads all of “The Ferry Home”.")
  const before = await moments()

  const summary = "Mara comes home for the funeral and finds Jonas waiting below the crane."
  const found = ["Mara sees Grayhaven from the ferry.", "Jonas meets her at the dock.", "The island takes her measure."]
  ai.reply(`Summary: ${summary}\nMoments:\n${found.map((moment) => `- ${moment}`).join("\n")}`)
  await panel.getByRole("button", { name: "Run Summarize chapter" }).click()
  const card = await newestCard(panel, 1)
  await expect(card).toHaveAttribute("data-ai-card-status", "done")
  expect(ai.sent).toHaveLength(1)
  expect(userPrompt(ai.sent[0])).toContain("# The chapter\n<chapter>\n")
  expect(userPrompt(ai.sent[0])).toContain(SCENE_END)

  await card.getByRole("button", { name: "Use as the chapter's summary" }).click()
  await expect(toast(page, "Changed the summary of “The Ferry Home”.")).toBeVisible()
  await expect.poll(() => queryDb(page, "SELECT summary FROM chapters WHERE id = ?", [chapterId])).toEqual([{ summary }])

  await card.getByRole("button", { name: "Add these moments to the chapter" }).click()
  await expect(toast(page, "Added 3 moments to “The Ferry Home”.")).toBeVisible()
  await expect.poll(moments).toEqual([...before, ...found])
})

test("a tool of your own runs its prompt, filled in from the book, and can be edited and deleted", async ({ page }) => {
  const ai = await fakeAi(page, LOCAL_AI)
  const editor = await openFirstChapter(page)
  await setUpLocalAi(page)
  await focusEnd(editor)
  const panel = await openAiPanel(page)

  await panel.getByRole("button", { name: "Your own tools" }).click()
  const tools = page.getByRole("dialog")
  await expect(tools).toContainText("You haven't made any yet.")
  await tools.getByRole("button", { name: "New tool" }).click()
  await expect(page.getByRole("dialog", { name: "New tool" })).toBeVisible()
  const name = tools.getByRole("textbox", { name: "Name" })
  await expect(name).toBeFocused()
  await name.fill("Harbor gossip")
  const ask = tools.getByRole("textbox", { name: "What it asks the AI" })
  await ask.fill("List what the harbor says about Mara, given this: ")
  await tools.getByRole("button", { name: "Insert {summary}" }).click()
  await expect(ask).toHaveValue("List what the harbor says about Mara, given this: {summary}")
  await expect(ask).toBeFocused()
  await tools.getByRole("radio", { name: "A list of ideas" }).check()
  await tools.getByRole("button", { name: "Make the tool" }).click()
  await expect(toast(page, "Made “Harbor gossip”. It's in the AI tools, ready to run.")).toBeVisible()
  await expect(tools.getByRole("list", { name: "Your tools" })).toContainText("Harbor gossip")
  await tools.getByRole("button", { name: "Done" }).click()
  await expect(tools).toBeHidden()
  await expect(panel.locator("[data-ai-tool]")).toHaveText("Harbor gossip")

  ai.reply("1. She left owing money.\n2. She only came back for the house.")
  await panel.getByRole("button", { name: "Run Harbor gossip" }).click()
  const card = await newestCard(panel, 1)
  await expect(card).toHaveAttribute("data-ai-card-status", "done")
  await expect(card.getByRole("listitem")).toHaveCount(2)
  await expect(card.getByRole("button", { name: "Add as a moment" })).toHaveCount(2)
  expect(ai.sent).toHaveLength(1)
  expect(userPrompt(ai.sent[0])).toBe(`List what the harbor says about Mara, given this: ${CHAPTER_SUMMARY}`)
  expect(ai.sent[0].body.messages[0].content).toContain("numbered list")

  // Edit, then delete, which Undo takes back.
  await panel.getByRole("button", { name: "Your own tools" }).click()
  await tools.getByRole("button", { name: "Edit" }).click()
  await expect(page.getByRole("dialog", { name: "Edit tool" })).toBeVisible()
  await name.fill("Harbor talk")
  await tools.getByRole("button", { name: "Save", exact: true }).click()
  await expect(toast(page, "Saved “Harbor talk”.")).toBeVisible()
  const list = tools.getByRole("list", { name: "Your tools" })
  await expect(list).toContainText("Harbor talk")
  await tools.getByRole("button", { name: "Delete" }).click()
  await expect(tools).toContainText("You haven't made any yet.")
  await toast(page, "Deleted “Harbor talk”.").getByRole("button", { name: "Undo" }).click()
  await expect(list).toContainText("Harbor talk")
})

test("the book's point of view, tense and style guide go to the AI with every run", async ({ page }) => {
  const ai = await fakeAi(page, LOCAL_AI)
  const editor = await openFirstChapter(page)
  await setUpLocalAi(page)

  await page.getByRole("button", { name: "Book: The Salt Ledger" }).click()
  await page.getByRole("menuitem", { name: "Book settings…" }).click()
  const dialog = page.getByRole("dialog", { name: "Book settings" })
  await dialog.getByRole("combobox", { name: "Point of view" }).click()
  await page.getByRole("option", { name: "First person (I walked)" }).click()
  await dialog.getByRole("combobox", { name: "Tense" }).click()
  await page.getByRole("option", { name: /^Present/ }).click()
  await dialog.getByRole("textbox", { name: "Style guide" }).fill("Short sentences. No adverbs.")
  await dialog.getByRole("button", { name: "Save", exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect
    .poll(() => queryDb(page, "SELECT pov, tense, style_guide FROM books WHERE id = ?", [openBookId(page)]))
    .toEqual([{ pov: "first", tense: "present", style_guide: "Short sentences. No adverbs." }])

  await focusEnd(editor)
  const panel = await openAiPanel(page)
  await panel.getByRole("button", { name: "Run Continue" }).click()
  await expect(await newestCard(panel, 1)).toHaveAttribute("data-ai-card-status", "done")
  const prompt = userPrompt(ai.sent[0])
  expect(prompt).toContain("Point of view: first person\nTense: present tense")
  expect(prompt).toContain("## Style guide\nShort sentences. No adverbs.")
})

test.describe("on a phone", () => {
  test.use({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true })

  test("the AI tools open over the text, and Insert closes them and goes back to it", async ({ page }) => {
    const ai = await fakeAi(page, LOCAL_AI)
    const editor = await openFirstChapter(page)
    await setUpLocalAi(page)
    await focusEnd(editor)
    await page.getByRole("button", { name: "More writing tools" }).click()
    await page.getByRole("menuitem", { name: "AI tools" }).click()
    const sheet = page.getByRole("dialog", { name: "AI tools" })
    await expect(sheet.locator("[data-ai-panel-heading]")).toBeFocused()
    await expect(sheet.getByText(LOCAL_ROUTE)).toBeVisible()

    ai.reply("A gull laughed at nothing.", "The tide turned without her.")
    await sheet.getByRole("button", { name: "Run Continue" }).click()
    const card = await newestCard(sheet, 1)
    await expect(card).toHaveAttribute("data-ai-card-status", "done")
    await version(card, "A gull laughed at nothing.").getByRole("button", { name: "Insert" }).click()
    await expect(sheet).toBeHidden()
    await expect(editor).toBeFocused()
    await expect(editor.locator(".ai-generated")).toHaveText("A gull laughed at nothing.")
    await expect(editor).toContainText(`${SCENE_END} A gull laughed at nothing.`)
  })
})
