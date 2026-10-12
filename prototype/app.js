(function () {
  "use strict";
  const W = window,
    D = document,
    DATA = W.BOOKBOOKBOOK_DATA,
    UI = W.UI,
    KEY = "bookbookbookPrototype.v1";
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const isObj = (x) => !!x && typeof x === "object" && !Array.isArray(x);
  // Stored values win, but nested objects keep defaults for keys added since the last save.
  function merge(base, over) {
    const out = { ...base };
    Object.keys(isObj(over) ? over : {}).forEach((k) => (out[k] = isObj(base[k]) && isObj(over[k]) ? merge(base[k], over[k]) : over[k]));
    return out;
  }
  const SCREENS = ["plan", "write", "codex", "inbox"];
  const DAILY = 1000;
  const BOOKS = [
    ["salt", "The Salt Ledger"],
    ["untitled", "Untitled Project"],
  ];
  const FONTS = {
    Literata: "Literata, Georgia, serif",
    Georgia: 'Georgia, "Times New Roman", serif',
    "Iowan Old Style": '"Iowan Old Style", "Palatino Linotype", Palatino, serif',
    Inter: 'Inter, "Segoe UI", system-ui, sans-serif',
    Monospace: '"Courier Prime", "Courier New", monospace',
  };
  const MODELS = ["Claude Sonnet $$", "GPT-5 mini $", "Gemini Pro $$", "Opus-class $$$", "OpenRouter: any model", "Ollama · llama3.1:8b (free)"];
  const MODEL_TOOLS = ["Continue", "Rewrite", "Describe", "Brainstorm", "Feedback"];
  const TABS = [
    ["ai", "AI & models"],
    ["style", "Writing style"],
    ["speech", "Speech"],
    ["appearance", "Appearance"],
    ["account", "Account & plan"],
    ["privacy", "Privacy"],
  ];
  const SETTING_DEFAULTS = {
    hostedCredits: true,
    localEndpoint: "http://localhost:11434",
    keys: {},
    toolModels: {},
    tense: "Past",
    person: "Third limited",
    styleSample: "",
    avoidWords: "",
    voiceCommands: true,
    ttsVoice: "",
    ttsRate: 1,
    proseSize: 19,
    proseLH: 1.75,
    pageWidth: 66,
    highContrast: false,
    telemetry: false,
  };
  const APPEARANCE = ["proseFont", "proseSize", "proseLH", "pageWidth", "highContrast"];
  const OUT_FMT = {
    proseSize: (v) => `${v}px`,
    proseLH: (v) => (+v).toFixed(2),
    pageWidth: (v) => `${v}ch`,
    ttsRate: (v) => `${(+v).toFixed(1)}×`,
  };
  function seedCards() {
    return [
      { id: "seed-continue", tool: "Continue", time: "10:42", model: "Claude Sonnet", credits: "1.2", body: DATA.aiOutputs.Continue },
      {
        id: "seed-describe",
        tool: "Describe",
        kind: "describe",
        time: "10:39",
        model: "GPT-5 mini",
        credits: "0.6",
        body: "",
        groups: {
          Sight: "Brass gone green at the seams.",
          Sound: "The lamp glass ticking as it cooled.",
          Smell: "Paraffin, salt, and old wool.",
          Touch: "Ledger pages stiff as dried kelp.",
          Metaphor: "The room held its breath like a bell under water.",
        },
      },
    ];
  }
  function defaults() {
    return {
      screen: "plan",
      book: "salt",
      template: "save",
      rightTab: "AI",
      activeChapter: "ch3",
      activeScene: null,
      codexType: "Characters",
      codexEntry: "mara",
      settings: merge(SETTING_DEFAULTS, clone(DATA.settings)),
      chapters: clone(DATA.chapters),
      inbox: clone(DATA.inbox),
      aiCards: seedCards(),
      aiModel: "GPT-5 mini $",
      credits: 1240,
      today: 512,
      snapshots: {},
      collapsedActs: {},
      foldedScenes: {},
      contextOff: {},
      codexOverrides: {},
      planDisplay: {},
      planFilter: {},
      voiceDraft: "",
      voiceEngine: "device",
      voiceMode: "live",
    };
  }

  W.App = {
    state: defaults(),
    settingsTab: "ai",
    cmdIndex: 0,
    init() {
      let stored = {};
      try {
        stored = JSON.parse(localStorage.getItem(KEY) || "{}");
      } catch (e) {
        stored = {};
      }
      const base = defaults();
      this.state = isObj(stored) ? { ...base, ...stored, settings: merge(base.settings, stored.settings) } : base;
      if (!SCREENS.includes(this.state.screen)) this.state.screen = "plan";
      UI.wireCommon();
      this.applyAppearance();
      this.render();
      // Voices load asynchronously; refresh the Speech tab if it's showing.
      W.speechSynthesis?.addEventListener?.("voiceschanged", () => {
        if (this.settingsTab === "speech" && D.getElementById("settingsModal")?.classList.contains("open")) this.refreshSettings();
      });
    },
    save() {
      try {
        localStorage.setItem(KEY, JSON.stringify(this.state));
      } catch (e) {
        if (!this._saveWarned) UI.toast("Couldn't save locally · browser storage is full or blocked");
        this._saveWarned = true;
      }
    },
    chapter(id) {
      return this.state.chapters.find((c) => c.id === id);
    },
    clearMenus() {
      D.querySelectorAll(".floating-menu.open,.context-menu.open,.popover.open,.fm-sub.open").forEach((x) => x.classList.remove("open"));
      D.querySelectorAll(".floating-menu [aria-expanded='true']").forEach((x) => x.setAttribute("aria-expanded", "false"));
    },
    themeButtons(asMenu) {
      const cur = this.state.settings.theme;
      return ["light", "sepia", "dark"]
        .map((t) =>
          asMenu
            ? `<button role="menuitemradio" aria-checked="${cur === t}" data-theme="${t}">${UI.cap(t)} theme</button>`
            : `<button data-theme="${t}" aria-pressed="${cur === t}" class="${cur === t ? "active" : ""}">${UI.cap(t)}</button>`,
        )
        .join("");
    },
    topbar() {
      const s = this.state,
        book = BOOKS.find((b) => b[0] === s.book) || BOOKS[0];
      return `<header class="topbar">
        <div class="wordmark">bookbookbook</div>
        <div class="menu-wrap desktop-book">
          <button class="book-switch" data-menu-toggle="book" aria-haspopup="menu" aria-expanded="false">${UI.icon("book")} ${UI.esc(book[1])} ▾</button>
          <div class="menu-pop" data-menu-pop="book" role="menu" aria-label="Books">${BOOKS.map(([id, name]) => `<button role="menuitemradio" aria-checked="${id === book[0]}" data-book="${id}">${UI.esc(name)}</button>`).join("")}<button role="menuitem" data-template-modal>New book from template…</button></div>
        </div>
        <nav class="main-tabs" aria-label="Screens">${SCREENS.map((x) => `<button class="tab-btn${s.screen === x ? " active" : ""}" data-screen="${x}"${s.screen === x ? ' aria-current="page"' : ""}>${UI.cap(x)}${x === "inbox" ? ` <span class="badge" aria-label="${s.inbox.length} notes">${s.inbox.length}</span>` : ""}</button>`).join("")}</nav>
        <span class="spacer"></span>
        <button class="icon-btn" data-global-mic aria-label="Quick voice note" title="Quick voice note">${UI.icon("mic")}</button>
        ${this.ringHTML()}
        <div class="seg theme-seg" role="group" aria-label="Theme">${this.themeButtons(false)}</div>
        <button class="small-btn desktop-only" data-palette aria-label="Command palette" title="Command palette (Ctrl+K)">⌘K</button>
        <button class="icon-btn desktop-only" data-settings aria-label="Settings" title="Settings">${UI.icon("gear")}</button>
        <button class="chip desktop-only" data-signup>Guest · Local only</button>
        <div class="menu-wrap mobile-more">
          <button class="icon-btn" data-menu-toggle="more" aria-haspopup="menu" aria-expanded="false" aria-label="More">${UI.icon("more")}</button>
          <div class="menu-pop menu-pop-right" data-menu-pop="more" role="menu" aria-label="More">${this.themeButtons(true)}<button role="menuitem" data-palette>Command palette</button><button role="menuitem" data-settings>Settings</button><button role="menuitem" data-signup>Guest · Local only</button></div>
        </div>
        <span class="saved">Saved locally · just now</span>
      </header>`;
    },
    ringHTML() {
      const t = Math.max(0, this.state.today ?? 512),
        pct = Math.min(100, Math.round((t / DAILY) * 100));
      return `<span class="chip word-ring" role="img" aria-label="Today: ${t.toLocaleString()} of ${DAILY.toLocaleString()} words (${pct}%)" title="Today's words · goal ${DAILY.toLocaleString()}" style="--ring:${pct}%"><span class="ring" aria-hidden="true"></span>${t.toLocaleString()} / ${DAILY.toLocaleString()}</span>`;
    },
    updateRing() {
      const r = D.querySelector(".topbar .word-ring");
      if (r) r.outerHTML = this.ringHTML();
    },
    mobileTabs() {
      return `<nav class="mobile-tabs" aria-label="Screens">${SCREENS.map((x) => `<button class="${this.state.screen === x ? "active" : ""}" data-screen="${x}"${this.state.screen === x ? ' aria-current="page"' : ""}>${UI.cap(x)}</button>`).join("")}<button data-settings>More</button></nav>`;
    },
    render() {
      // Anything bound to the old DOM (dictation, pending prose edits, speech) settles first.
      W.Voice?.halt?.();
      W.Write?.flush?.();
      if (this.state.screen !== "write") {
        W.Write?.stopSpeech?.();
        W.Write?.exitFocus?.();
      }
      UI.clearToast();
      UI.setTheme(this.state.settings.theme);
      const prevScroll = D.querySelector(".page-scroll")?.scrollTop,
        caret = this.saveCaret(),
        screen = this.state.screen,
        body = screen === "inbox" ? W.Voice.renderInbox() : { plan: W.Plan, write: W.Write, codex: W.Codex }[screen].render();
      D.getElementById("app").innerHTML = this.topbar() + `<main class="main" id="main">${body}</main>` + this.mobileTabs() + this.globalModals();
      this.restoreScroll(prevScroll);
      this.wire();
      this.restoreCaret(caret);
      setTimeout(() => {
        W.Plan?.layoutRibbon?.();
        W.Write?.autogrow?.();
      }, 0);
    },
    go(screen) {
      if (!SCREENS.includes(screen)) return;
      this.state.screen = screen;
      this.save();
      this.render();
    },
    // Palette jumps land where a tab click would; Write lands in the prose, ready to type.
    arrive(screen) {
      this.go(screen);
      if (screen === "write" && W.Write.focusProse()) return;
      [...D.querySelectorAll(`[data-screen="${screen}"]`)].find((b) => b.getClientRects().length)?.focus({ preventScroll: true });
    },
    // Re-renders replace the editor DOM; keep the writer's place unless the view itself changed.
    restoreScroll(prev) {
      const s = this.state,
        manuscript = s.settings.unit === "manuscript";
      const key = `${s.screen}|${s.settings.unit}|${manuscript ? "" : s.activeChapter}`;
      const ps = D.querySelector(".page-scroll");
      if (ps && key === this._scrollKey && prev != null) ps.scrollTop = prev;
      else if (ps && manuscript) W.Write.scrollToChapter(s.activeChapter);
      this._scrollKey = key;
    },
    // Ctrl+J and palette AI commands re-render while the writer is typing; keep their caret/selection.
    saveCaret() {
      const el = D.activeElement,
        sel = W.getSelection();
      if (!el?.matches(".prose[data-scene]") || !sel.rangeCount || !el.contains(sel.anchorNode)) return null;
      const at = (node, off) => {
        const r = D.createRange();
        r.selectNodeContents(el);
        r.setEnd(node, off);
        return r.toString().length;
      };
      const a = at(sel.anchorNode, sel.anchorOffset),
        inF = el.contains(sel.focusNode);
      // `as`/`fs` keep a caret at the start of a paragraph from snapping to the end of the previous one.
      return {
        key: el.dataset.scene,
        a,
        as: sel.anchorOffset === 0,
        f: inF ? at(sel.focusNode, sel.focusOffset) : a,
        fs: inF ? sel.focusOffset === 0 : sel.anchorOffset === 0,
      };
    },
    restoreCaret(c) {
      const el = c && [...D.querySelectorAll(".prose[data-scene]")].find((p) => p.dataset.scene === c.key);
      if (!el) return;
      const find = (n, start) => {
        const w = D.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        for (let t; (t = w.nextNode()); n -= t.length) if (n < t.length || (n === t.length && !start)) return [t, n];
        return [el, el.childNodes.length];
      };
      el.focus({ preventScroll: true });
      W.getSelection().setBaseAndExtent(...find(c.a, c.as), ...find(c.f, c.fs));
    },
    applyAppearance() {
      const s = this.state.settings,
        root = D.documentElement;
      root.style.setProperty("--editor-font", FONTS[s.proseFont] || FONTS.Literata);
      root.style.setProperty("--prose-size", (+s.proseSize || 19) + "px");
      root.style.setProperty("--prose-lh", String(+s.proseLH || 1.75));
      root.style.setProperty("--page-w", (+s.pageWidth || 66) + "ch");
      root.classList.toggle("high-contrast", !!s.highContrast);
      UI.setTheme(s.theme);
    },
    setTheme(t) {
      this.state.settings.theme = t;
      this.save();
      UI.setTheme(t);
      D.querySelectorAll("button[data-theme]").forEach((b) => {
        const on = b.dataset.theme === t;
        if (b.getAttribute("role") === "menuitemradio") return b.setAttribute("aria-checked", String(on));
        b.classList.toggle("active", on);
        b.setAttribute("aria-pressed", String(on));
      });
    },
    globalModals() {
      const tab = this.settingsTab;
      const tabs = `<div class="settings-tabs" role="tablist" aria-label="Settings sections">${TABS.map(([id, label]) => `<button class="small-btn${id === tab ? " active" : ""}" role="tab" id="stab-${id}" aria-selected="${id === tab}" aria-controls="settingsPane" tabindex="${id === tab ? 0 : -1}" data-settings-tab="${id}"${id === tab ? " data-autofocus" : ""}>${label}</button>`).join("")}</div>`;
      return `${UI.modal("settingsModal", "Settings", `${tabs}<div id="settingsPane" class="settings-pane" role="tabpanel" aria-labelledby="stab-${tab}">${this.settingsPane(tab)}</div>`)}${UI.modal("signupModal", "Create your Studio account", this.signupHTML())}<div id="palette" class="palette"><div class="scrim" data-close></div><div class="palette-box" role="dialog" aria-modal="true" aria-label="Command palette"><input id="cmdInput" role="combobox" aria-expanded="true" aria-controls="cmdList" aria-autocomplete="list" aria-label="Search commands" placeholder="Search commands…" autocomplete="off" spellcheck="false" data-autofocus><div id="cmdList" role="listbox" aria-label="Commands"></div></div></div>`;
    },
    engineSeg(labelId) {
      const cur = this.state.voiceEngine === "cloud" ? "cloud" : "device";
      return `<div class="seg engine-seg" role="group" ${labelId ? `aria-labelledby="${labelId}"` : 'aria-label="Speech engine"'}>${[
        ["device", "On-device"],
        ["cloud", "Cloud · higher accuracy"],
      ]
        .map(([k, l]) => `<button data-engine="${k}" aria-pressed="${cur === k}" class="${cur === k ? "active" : ""}">${l}</button>`)
        .join("")}</div>`;
    },
    setEngine(k) {
      this.state.voiceEngine = k;
      this.save();
      D.querySelectorAll("[data-engine]").forEach((b) => {
        const on = b.dataset.engine === k;
        b.classList.toggle("active", on);
        b.setAttribute("aria-pressed", String(on));
      });
      UI.toast(k === "cloud" ? "Cloud speech · higher accuracy; audio is deleted after transcription" : "On-device speech · audio never leaves this computer");
    },
    settingsPane(tab) {
      const st = this.state,
        s = st.settings,
        check = (k, label, hint) => `<label class="check"><input type="checkbox" data-setting="${k}"${s[k] ? " checked" : ""}> ${label}${hint ? ` <small class="muted">${hint}</small>` : ""}</label>`,
        range = (k, label, min, max, step) =>
          `<label class="field range-field"><span>${label} · <output>${OUT_FMT[k](s[k])}</output></span><input type="range" min="${min}" max="${max}" step="${step}" data-setting="${k}" value="${s[k]}"></label>`,
        choice = (k, label, opts) =>
          `<div class="field"><span id="lbl-${k}">${label}</span><div class="seg" role="group" aria-labelledby="lbl-${k}">${opts.map((o) => `<button data-setting-choice="${k}" data-value="${o}" aria-pressed="${s[k] === o}" class="${s[k] === o ? "active" : ""}">${o}</button>`).join("")}</div></div>`;
      if (tab === "ai") {
        const keyRow = (p) =>
          `<div class="settings-row"><label for="key-${p}">${p}</label><input id="key-${p}" type="password" autocomplete="off" data-key="${p}" placeholder="${s.keys[p] ? "•••••••• added" : `Paste your ${p} key`}"><small>${s.keys[p] ? `<button class="link-btn" data-key-clear="${p}">Remove key</button>` : "Stored only on this device"}</small></div>`;
        return `${check("hostedCredits", "Use hosted credits", `${(st.credits ?? 1240).toLocaleString(undefined, { maximumFractionDigits: 1 })} credits left`)}
          <h3>Your own keys</h3><form class="keys-form" data-keys-form>${["OpenRouter", "OpenAI", "Anthropic"].map(keyRow).join("")}</form>
          <div class="settings-row local-row"><label for="localEp">Local endpoint</label><input id="localEp" data-setting="localEndpoint" value="${UI.esc(s.localEndpoint)}" spellcheck="false"><button class="small-btn" data-test-endpoint>Test</button><small class="chip" id="epStatus" role="status">${UI.esc(this.epStatus || "Not tested")}</small></div>
          <p class="saved">We never train on your writing.</p>
          <h3>Default model per tool</h3><table class="settings-table"><tbody>${MODEL_TOOLS.map((t) => `<tr><td><label for="tm-${t}">${t}</label></td><td><select id="tm-${t}" data-tool-model="${t}"><option value="">Same as the AI panel</option>${MODELS.map((m) => `<option${s.toolModels[t] === m ? " selected" : ""}>${UI.esc(m)}</option>`).join("")}</select></td></tr>`).join("")}</tbody></table>`;
      }
      if (tab === "style")
        return `<p class="muted">AI tools follow these whenever they write in your book.</p>${choice("tense", "Tense", ["Past", "Present"])}${choice("person", "Point of view", ["First", "Third limited", "Third omniscient"])}
          <div class="field"><label for="styleSample">Style sample</label><textarea id="styleSample" data-setting="styleSample" placeholder="Paste a paragraph that sounds like you…">${UI.esc(s.styleSample)}</textarea></div>
          <div class="field"><label for="avoidWords">Words to avoid</label><input id="avoidWords" data-setting="avoidWords" value="${UI.esc(s.avoidWords)}" placeholder="e.g. suddenly, delve, tapestry"></div>`;
      if (tab === "speech") {
        const voices = W.speechSynthesis?.getVoices?.() || [];
        return `<h3>Dictation</h3><div class="field"><span id="lbl-engine">Speech engine</span>${this.engineSeg("lbl-engine")}</div>
          ${check("voiceCommands", "Voice commands", "say “new line”, “new beat”, “period”")}
          <h3>Read aloud</h3>
          <div class="field"><label for="ttsVoice">Voice</label><select id="ttsVoice" data-setting="ttsVoice"><option value="">System default</option>${voices.map((v) => `<option value="${UI.esc(v.name)}"${v.name === s.ttsVoice ? " selected" : ""}>${UI.esc(v.name)}${v.lang ? ` · ${UI.esc(v.lang)}` : ""}</option>`).join("")}</select>${voices.length ? "" : `<small class="muted">${W.speechSynthesis ? "This browser hasn't listed its voices yet; the system default is used." : "Read aloud isn't supported in this browser."}</small>`}</div>
          ${range("ttsRate", "Speed", 0.6, 1.6, 0.1)}
          <p><button class="small-btn" data-tts-test>Play a sample</button></p>`;
      }
      if (tab === "appearance")
        return `<div class="field"><span id="lbl-theme">Theme</span><div class="seg theme-seg" role="group" aria-labelledby="lbl-theme">${this.themeButtons(false)}</div></div>
          <div class="field"><label for="proseFont">Prose font</label><select id="proseFont" data-setting="proseFont">${Object.keys(FONTS).map((f) => `<option${f === s.proseFont ? " selected" : ""}>${f}</option>`).join("")}</select></div>
          ${range("proseSize", "Text size", 15, 26, 1)}${range("proseLH", "Line spacing", 1.4, 2.1, 0.05)}${range("pageWidth", "Page width", 48, 90, 2)}
          ${check("highContrast", "High contrast", "stronger text and borders")}
          <div class="appearance-preview" aria-hidden="true"><p>The harbor sounds different after rain, like every rope has remembered a secret.</p></div>
          <p><button class="small-btn" data-appearance-reset>Reset appearance</button></p>`;
      if (tab === "account")
        return `<p>You're writing as a <b>guest</b>. Everything stays in this browser.</p><div class="grid cols"><div class="template-card"><h3>Free</h3><p>Local writing, your own AI keys and local models.</p><span class="chip">Current plan</span></div><div class="template-card"><h3>Studio</h3><p>Sync across devices, cloud history and hosted AI credits.</p><button class="pill-btn active" data-signup>Create account</button></div></div>`;
      return `${check("telemetry", "Share anonymous usage stats", "off by default · never includes your writing")}
        <p class="saved">We never train on your writing. AI requests send only the context listed in the AI panel's preview.</p>
        <h3>Your data</h3><p><button class="small-btn" data-export>Export everything (JSON)</button></p>
        <h3>Reset</h3><p class="muted">Erase every change made in this prototype and reload the sample book.</p><p><button class="small-btn${this.resetArmed ? " danger" : ""}" data-reset>${this.resetArmed ? "Click again to erase everything" : "Reset prototype data"}</button></p>`;
    },
    refreshSettings(focusSel) {
      const pane = D.getElementById("settingsPane");
      if (!pane) return;
      const tab = this.settingsTab;
      D.querySelectorAll("[data-settings-tab]").forEach((b) => {
        const on = b.dataset.settingsTab === tab;
        b.classList.toggle("active", on);
        b.setAttribute("aria-selected", String(on));
        b.tabIndex = on ? 0 : -1;
        b.toggleAttribute("data-autofocus", on);
      });
      pane.setAttribute("aria-labelledby", "stab-" + tab);
      pane.innerHTML = this.settingsPane(tab);
      if (focusSel) pane.querySelector(focusSel)?.focus();
    },
    openSettings(tab) {
      if (tab) this.settingsTab = tab;
      this.resetArmed = false;
      this.refreshSettings();
      D.getElementById("settingsModal")?.classList.add("open");
    },
    showTab(id, focus) {
      this.settingsTab = id;
      this.resetArmed = false;
      this.refreshSettings();
      if (focus) D.getElementById("stab-" + id)?.focus();
    },
    setSetting(t) {
      const k = t.dataset.setting,
        s = this.state.settings,
        v = t.type === "checkbox" ? t.checked : t.type === "range" ? +t.value : t.value;
      s[k] = v;
      this.save();
      const out = t.closest("label")?.querySelector("output");
      if (out && OUT_FMT[k]) out.textContent = OUT_FMT[k](v);
      if (APPEARANCE.includes(k)) this.applyAppearance();
      if (k === "localEndpoint") {
        clearTimeout(this._epT);
        this.epStatus = "";
        const chip = D.getElementById("epStatus");
        if (chip) chip.textContent = "Not tested";
      }
      if (k === "hostedCredits") UI.toast(v ? "Hosted credits on" : "Hosted credits off · AI runs on your key or a local model");
      if (k === "telemetry") UI.toast(v ? "Anonymous usage stats on · thank you" : "Usage stats off");
      if (k === "voiceCommands") UI.toast(v ? "Voice commands on" : "Voice commands off · words are typed as spoken");
    },
    setChoice(b) {
      const k = b.dataset.settingChoice,
        v = b.dataset.value;
      this.state.settings[k] = v;
      this.save();
      b.parentElement.querySelectorAll("[data-setting-choice]").forEach((x) => {
        x.classList.toggle("active", x === b);
        x.setAttribute("aria-pressed", String(x === b));
      });
      const POV = { First: "first person", "Third limited": "third person limited", "Third omniscient": "third person omniscient" };
      UI.toast(k === "tense" ? `AI drafts in the ${v.toLowerCase()} tense` : `AI drafts in ${POV[v] || v.toLowerCase()}`);
    },
    setToolModel(t) {
      const m = this.state.settings.toolModels,
        tool = t.dataset.toolModel;
      if (t.value) m[tool] = t.value;
      else delete m[tool];
      this.save();
      UI.toast(`${tool} uses ${t.value || "the AI panel's model"}`);
    },
    // The prototype never stores the key itself, only that one was added.
    saveKey(input) {
      const p = input.dataset.key;
      if (!input.value.trim()) return;
      this.state.settings.keys[p] = true;
      input.value = "";
      this.save();
      this.syncKeyRow(p);
      UI.toast(`${p} key added · the prototype only remembers that you added one`);
    },
    clearKey(p) {
      delete this.state.settings.keys[p];
      this.save();
      this.syncKeyRow(p);
      D.getElementById("key-" + p)?.focus();
      UI.toast(`${p} key removed`);
    },
    // Keys save on change, which fires mid-Tab or mid-click; re-rendering the pane would swallow that Tab or click.
    syncKeyRow(p) {
      const input = D.getElementById("key-" + p),
        has = !!this.state.settings.keys[p];
      if (!input) return;
      input.placeholder = has ? "•••••••• added" : `Paste your ${p} key`;
      input.nextElementSibling.innerHTML = has ? `<button class="link-btn" data-key-clear="${p}">Remove key</button>` : "Stored only on this device";
    },
    testEndpoint() {
      const v = String(this.state.settings.localEndpoint || "").trim(),
        set = (msg) => {
          this.epStatus = msg;
          const chip = D.getElementById("epStatus");
          if (chip) chip.textContent = msg;
        };
      set("Testing…");
      clearTimeout(this._epT);
      this._epT = setTimeout(() => {
        const ok = /^https?:\/\/[^\s/]+(\/\S*)?$/i.test(v);
        set(ok ? "Connected · 3 models" : "Can't reach that address");
        UI.toast(ok ? "Prototype: pretend we found llama3.1:8b, mistral and qwen2.5" : "Use an address like http://localhost:11434");
      }, 700);
    },
    ttsTest() {
      const ss = W.speechSynthesis;
      if (!ss) return UI.toast("Read aloud isn't supported in this browser");
      W.Write?.stopSpeech?.();
      ss.cancel();
      const s = this.state.settings,
        u = new SpeechSynthesisUtterance("The harbor sounds different after rain, like every rope has remembered a secret."),
        v = s.ttsVoice && ss.getVoices().find((x) => x.name === s.ttsVoice);
      u.rate = +s.ttsRate || 1;
      if (v) u.voice = v;
      ss.speak(u);
      UI.toast("Playing a sample…");
    },
    resetAppearance() {
      const s = this.state.settings;
      APPEARANCE.forEach((k) => (s[k] = k === "proseFont" ? DATA.settings.proseFont : SETTING_DEFAULTS[k]));
      this.save();
      this.applyAppearance();
      this.refreshSettings("[data-appearance-reset]");
      UI.toast("Appearance reset");
    },
    exportData() {
      W.Write?.flush?.();
      const blob = new Blob([JSON.stringify({ app: "bookbookbook", version: 1, exported: new Date().toISOString(), data: this.state }, null, 2)], { type: "application/json" }),
        a = D.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "bookbookbook-export.json";
      D.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      UI.toast("Exported bookbookbook-export.json");
    },
    resetData(btn) {
      if (!this.resetArmed) {
        this.resetArmed = true;
        btn.textContent = "Click again to erase everything";
        btn.classList.add("danger");
        clearTimeout(this._resetT);
        this._resetT = setTimeout(() => {
          this.resetArmed = false;
          const b = D.querySelector("[data-reset]");
          if (b) {
            b.textContent = "Reset prototype data";
            b.classList.remove("danger");
          }
        }, 5000);
        return UI.toast("Click again within 5 seconds to erase all prototype changes");
      }
      clearTimeout(this._resetT);
      this.resetArmed = false;
      // Pending edits belong to the old book; settle them before swapping state.
      W.Write?.flush?.();
      W.Write?.stopSpeech?.();
      W.Write?.exitFocus?.();
      localStorage.removeItem(KEY);
      this.state = defaults();
      this.settingsTab = "ai";
      this.epStatus = "";
      this.save();
      this.applyAppearance();
      // The re-render closes Settings; land on the screen's tab, as a palette jump would.
      this.arrive(this.state.screen);
      UI.toast("Prototype data reset");
    },
    signupHTML() {
      return `<p>Keep writing locally for free, or sign up for sync, cloud history and hosted AI credits.</p><form class="signup-form" data-signup-form novalidate><div class="grid cols"><label class="field"><span>Email</span><input type="email" name="email" autocomplete="email" placeholder="email@example.com" data-autofocus></label><label class="field"><span>Password</span><input type="password" name="password" autocomplete="new-password" placeholder="At least 8 characters"></label></div><p class="form-error" role="alert" hidden></p><p class="modal-actions"><button class="pill-btn active" type="submit">Sign up</button><button class="small-btn" type="button" data-signup-alt="magic">Email me a magic link</button><button class="small-btn" type="button" data-signup-alt="google">Continue with Google</button></p></form><p class="saved">Prototype only · nothing is sent anywhere.</p>`;
    },
    openSignup() {
      D.getElementById("settingsModal")?.classList.remove("open");
      const m = D.getElementById("signupModal");
      if (!m) return;
      const err = m.querySelector(".form-error");
      if (err) err.hidden = true;
      m.classList.add("open");
    },
    signupSubmit(form, alt) {
      if (!form) return;
      const email = form.querySelector('[name="email"]'),
        pw = form.querySelector('[name="password"]'),
        err = form.querySelector(".form-error"),
        fail = (msg, el) => {
          err.textContent = msg;
          err.hidden = false;
          el.focus();
        },
        done = (msg) => {
          form.reset();
          err.hidden = true;
          D.getElementById("signupModal")?.classList.remove("open");
          UI.toast(msg);
        };
      if (alt === "google") return done("Prototype: would open Google sign-in");
      if (!/^\S+@\S+\.\S+$/.test(email.value.trim())) return fail("Enter a valid email address.", email);
      if (alt === "magic") return done(`Prototype: would email a sign-in link to ${email.value.trim()}`);
      if (pw.value.length < 8) return fail("Use at least 8 characters for your password.", pw);
      done("Prototype: account created · your local work would start syncing");
    },
    /* ---------- Command palette ---------- */
    commandList() {
      const wr = W.Write || {};
      return [
        ["Navigate", "Go to Plan", "", "plan"],
        ["Navigate", "Go to Write", "", "write"],
        ["Navigate", "Go to Codex", "", "codex"],
        ["Navigate", "Go to Inbox", "", "inbox"],
        ["Plan views", "Board view", "", "board"],
        ["Plan views", "Outline view", "", "outline"],
        ["Plan views", "Matrix view", "", "matrix"],
        ["Plan views", "Timeline view", "", "timeline"],
        ["Plan views", "Corkboard view", "", "corkboard"],
        ["Write", "New chapter", "", "new-chapter"],
        ["Write", "Toggle focus mode", "Ctrl+.", "focus"],
        ["Write", `Turn typewriter scrolling ${this.state.settings.typewriter ? "off" : "on"}`, "", "typewriter"],
        ["Write", "Find & replace", "Ctrl+Shift+F", "find"],
        ["Write", "Snapshots", "", "snapshots"],
        ["Write", "Read-through", "", "read-through"],
        ["Write", wr._speaking ? "Stop reading aloud" : "Read aloud from the cursor", "", "read-aloud"],
        ["Write", wr._sprint ? "End writing sprint" : "Start 25-min writing sprint", "", "sprint"],
        ["Write", "Dictate at the cursor", "", "dictate"],
        ["AI tools", "Continue writing", "Ctrl+J", "Continue"],
        ["AI tools", "Rewrite selection", "", "Rewrite"],
        ["AI tools", "Describe", "", "Describe"],
        ["AI tools", "Brainstorm", "", "Brainstorm"],
        ["AI tools", "Chapter feedback", "", "Chapter feedback"],
        ["Voice", "Quick voice note", "", "voice"],
        ["Appearance", "Theme: Light", "", "theme-light"],
        ["Appearance", "Theme: Sepia", "", "theme-sepia"],
        ["Appearance", "Theme: Dark", "", "theme-dark"],
        ["Appearance", "Appearance settings", "", "settings-appearance"],
        ["Settings", "Open Settings", "", "settings"],
      ];
    },
    openPalette() {
      const p = D.getElementById("palette"),
        input = D.getElementById("cmdInput");
      if (!p || !input) return;
      this.closePops();
      this.commands = this.commandList();
      this.cmdIndex = 0;
      input.value = "";
      this.renderCommands("");
      p.classList.add("open");
      input.focus();
    },
    renderCommands(query) {
      const raw = String(query || "").trim(),
        q = raw.toLowerCase(),
        rows = (this.commands || []).filter((c) => !q || `${c[1]} ${c[0]}`.toLowerCase().includes(q)),
        list = D.getElementById("cmdList"),
        input = D.getElementById("cmdInput");
      if (!list) return;
      this.cmdIndex = Math.max(0, Math.min(this.cmdIndex, rows.length - 1));
      // Highlight on the raw label, then escape each piece, so entities never get split.
      const mark = (s) => {
        if (!q) return UI.esc(s);
        const low = s.toLowerCase(),
          out = [];
        let i = 0,
          j;
        while ((j = low.indexOf(q, i)) !== -1) {
          out.push(UI.esc(s.slice(i, j)), `<b>${UI.esc(s.slice(j, j + q.length))}</b>`);
          i = j + q.length;
        }
        out.push(UI.esc(s.slice(i)));
        return out.join("");
      };
      let html = "",
        last = null,
        g = 0;
      rows.forEach((c, i) => {
        if (c[0] !== last) {
          html += `${last === null ? "" : "</div>"}<div role="group" aria-labelledby="cmdg-${g}"><div class="cmd-section" id="cmdg-${g++}">${UI.esc(c[0])}</div>`;
          last = c[0];
        }
        html += `<div class="cmd${i === this.cmdIndex ? " active" : ""}" role="option" id="cmd-${i}" aria-selected="${i === this.cmdIndex}" data-command="${UI.esc(c[3])}"><span>${mark(c[1])}</span>${c[2] ? `<small>${UI.esc(c[2])}</small>` : ""}</div>`;
      });
      list.innerHTML = rows.length ? html + "</div>" : `<div class="cmd-empty">No commands match “${UI.esc(raw)}”</div>`;
      if (rows.length) input?.setAttribute("aria-activedescendant", "cmd-" + this.cmdIndex);
      else input?.removeAttribute("aria-activedescendant");
      const a = list.querySelector(".cmd.active");
      if (!a || this.cmdIndex === 0) list.scrollTop = 0;
      else {
        const lr = list.getBoundingClientRect(),
          ar = a.getBoundingClientRect(),
          head = a.previousElementSibling?.classList.contains("cmd-section") ? a.previousElementSibling.offsetHeight : 0;
        if (ar.top - head < lr.top) list.scrollTop += ar.top - head - lr.top;
        else if (ar.bottom > lr.bottom) list.scrollTop += ar.bottom - lr.bottom;
      }
    },
    paletteKey(e) {
      const rows = D.querySelectorAll("#cmdList .cmd");
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (!rows.length) return;
        this.cmdIndex = (this.cmdIndex + (e.key === "ArrowDown" ? 1 : -1) + rows.length) % rows.length;
        this.renderCommands(D.getElementById("cmdInput").value);
      } else if (e.key === "Enter") {
        e.preventDefault();
        rows[this.cmdIndex]?.click();
      } else if (e.key === "Tab") e.preventDefault();
    },
    runCommand(c) {
      D.getElementById("palette")?.classList.remove("open");
      const s = this.state;
      if (SCREENS.includes(c)) return s.screen === c || this.arrive(c);
      if (["board", "outline", "matrix", "timeline", "corkboard"].includes(c)) {
        s.settings.view = c;
        return this.arrive("plan");
      }
      if (c.startsWith("theme-")) return this.setTheme(c.slice(6));
      if (c === "settings" || c === "settings-appearance") return this.openSettings(c === "settings" ? null : "appearance");
      if (c === "voice") {
        if (s.screen !== "inbox") this.go("inbox");
        return W.Voice.startCapture();
      }
      // Writing commands wait a tick so the palette can hand focus (and the caret) back to the page first.
      setTimeout(() => this.runWriteCommand(c), 0);
    },
    runWriteCommand(c) {
      const Wr = W.Write;
      if (c === "new-chapter") {
        if (this.state.screen === "plan") return D.querySelector(".plan-view .subbar [data-add-chapter]")?.click();
        this.state.screen = "write";
        return Wr.addChapter();
      }
      if (["Continue", "Rewrite", "Describe", "Brainstorm", "Chapter feedback"].includes(c)) return Wr.runAI(c);
      if (c === "focus") return Wr.toggleFocus();
      Wr.ensureWrite();
      if (c === "typewriter") {
        Wr.viewToggle("typewriter");
        return UI.toast(`Typewriter scrolling ${this.state.settings.typewriter ? "on" : "off"}`);
      }
      if (c === "find") return Wr.openFind();
      if (c === "snapshots") return Wr.openSnapshots();
      if (c === "read-through") return Wr.openReadThrough();
      if (c === "read-aloud") return Wr.readAloud();
      if (c === "sprint") return Wr.toggleSprint();
      if (c === "dictate") return W.Voice.dictate(D.querySelector(".editor-toolbar [data-dictate]"));
    },

    /* ---------- Menus ---------- */
    menuItems(menu) {
      return [...menu.querySelectorAll('[role^="menuitem"]')].filter((b) => !b.disabled && b.closest('[role="menu"]') === menu && b.getClientRects().length);
    },
    toggleOf(pop) {
      return pop?.closest(".menu-wrap")?.querySelector("[data-menu-toggle]") || null;
    },
    setMenu(toggle, pop, open, focusItem = true) {
      if (!pop) return;
      pop.classList.toggle("open", open);
      toggle?.setAttribute("aria-expanded", String(open));
      if (!open) return;
      if (toggle && pop.closest(".toolbar-strip")) {
        // The toolbar strip scrolls horizontally (overflow hidden), so escape its clip box.
        const r = toggle.getBoundingClientRect();
        pop.style.position = "fixed";
        pop.style.top = r.bottom + 6 + "px";
        pop.style.left = Math.max(8, Math.min(innerWidth - pop.offsetWidth - 8, r.left)) + "px";
      }
      if (!focusItem) return;
      const items = this.menuItems(pop);
      (items.find((b) => b.getAttribute("role") === "menuitemradio" && b.getAttribute("aria-checked") === "true") || items[0] || pop.querySelector("select,input,textarea,button"))?.focus();
    },
    closePops(except) {
      D.querySelectorAll(".menu-pop.open").forEach((m) => m !== except && this.setMenu(this.toggleOf(m), m, false));
    },

    /* ---------- Chapter fields shared by the Plan drawer and the Write side panel ---------- */
    editChapter(t, commit) {
      const [cid, field] = t.dataset.editCh.split(":"),
        c = this.chapter(cid);
      if (!c) return;
      if (field === "target") {
        const n = Math.round(+t.value);
        if (commit) {
          c.target = Math.max(100, Math.min(200000, n || c.target || 3000));
          if (String(c.target) !== t.value) t.value = c.target;
        } else if (n >= 100 && n <= 200000) c.target = n;
        else return;
      } else if (field === "title") {
        c.title = commit ? t.value.trim() || "Untitled chapter" : t.value;
        if (commit && t.value !== c.title) t.value = c.title;
        const h = D.getElementById("drawerTitle");
        if (h) h.textContent = `Chapter ${c.n}: ${c.title.trim() || "Untitled chapter"}`;
      } else c[field] = t.value;
      this.save();
      if (commit) this.planNow();
      else this.planSoon();
    },
    planNow() {
      clearTimeout(this._planT);
      if (this.state.screen === "plan") W.Plan.refresh();
    },
    planSoon() {
      clearTimeout(this._planT);
      if (this.state.screen === "plan") this._planT = setTimeout(() => this.state.screen === "plan" && W.Plan.refresh(), 250);
    },
    beatAt(attr) {
      const [cid, i] = String(attr).split(":"),
        c = this.chapter(cid);
      return { cid, i: +i, c, beat: c?.beats?.[+i] };
    },

    /* ---------- Events ---------- */
    onClick(e) {
      const q = (sel) => e.target.closest(sel);
      let b;
      const toggle = q("[data-menu-toggle]");
      if (toggle) {
        const pop = D.querySelector(`[data-menu-pop="${toggle.dataset.menuToggle}"]`);
        this.closePops(pop);
        this.setMenu(toggle, pop, !pop?.classList.contains("open"));
      } else if (!q(".menu-wrap")) this.closePops();
      // Checkbox items keep their menu open for several toggles; other items close it and hand focus back.
      const item = !toggle && q(".menu-pop [role^='menuitem'], .menu-pop button");
      if (item && (item.getAttribute("role") !== "menuitemcheckbox" || item.dataset.viewToggle === "focus")) {
        const pop = item.closest(".menu-pop"),
          t = this.toggleOf(pop),
          had = pop.contains(D.activeElement) || D.activeElement === D.body;
        this.setMenu(t, pop, false);
        if (had) t?.focus({ preventScroll: true });
      }
      if ((b = q("[data-screen]"))) {
        const bar = b.closest(".mobile-tabs") ? ".mobile-tabs" : ".main-tabs",
          scr = b.dataset.screen;
        if (this.state.screen !== scr) this.go(scr);
        return D.querySelector(`${bar} [data-screen="${scr}"]`)?.focus({ preventScroll: true });
      }
      if ((b = q("[data-book]"))) return UI.toast(b.dataset.book === (this.state.book || "salt") ? "The Salt Ledger is already open" : "Prototype: only The Salt Ledger has sample data");
      if (q("[data-template-modal]")) {
        if (this.state.screen !== "plan") this.go("plan");
        return D.getElementById("templateModal")?.classList.add("open");
      }
      if (q("[data-settings]")) return this.openSettings();
      if (q("[data-signup]")) return this.openSignup();
      if (q("[data-palette]")) return this.openPalette();
      if (q("[data-global-mic]")) {
        if (this.state.screen !== "inbox") this.go("inbox");
        return W.Voice.startCapture();
      }
      if ((b = q("button[data-theme]"))) return this.setTheme(b.dataset.theme);
      if ((b = q("[data-settings-tab]"))) return this.showTab(b.dataset.settingsTab, true);
      if ((b = q("[data-setting-choice]"))) return this.setChoice(b);
      if ((b = q("[data-key-clear]"))) return this.clearKey(b.dataset.keyClear);
      if (q("[data-test-endpoint]")) return this.testEndpoint();
      if (q("[data-tts-test]")) return this.ttsTest();
      if (q("[data-appearance-reset]")) return this.resetAppearance();
      if (q("[data-export]")) return this.exportData();
      if ((b = q("[data-reset]"))) return this.resetData(b);
      if ((b = q("[data-signup-alt]"))) return this.signupSubmit(b.closest("form"), b.dataset.signupAlt);
      if ((b = q("[data-engine]"))) return this.setEngine(b.dataset.engine);
      if ((b = q("[data-dictate],[data-inline-mic]"))) return W.Voice.dictate(b);
      if ((b = q("[data-add-beat]"))) return W.Plan.addBeat(b.dataset.addBeat);
      if ((b = q("[data-remove-beat]"))) {
        const r = this.beatAt(b.dataset.removeBeat);
        return W.Plan.removeBeat(r.cid, r.i);
      }
      if ((b = q("[data-command]"))) return this.runCommand(b.dataset.command);
      if ((b = q("[data-toast]"))) UI.toast(b.dataset.toast);
    },
    onInput(e) {
      const t = e.target;
      if (t.id === "cmdInput") {
        this.cmdIndex = 0;
        return this.renderCommands(t.value);
      }
      if (t.matches("[data-setting]") && t.type !== "checkbox") return this.setSetting(t);
      if (t.matches("[data-edit-ch]")) return this.editChapter(t, false);
      if (t.matches("[data-beat-text]")) {
        const r = this.beatAt(t.dataset.beatText);
        if (!r.beat) return;
        r.beat[0] = t.value;
        this.save();
        this.planSoon();
      }
    },
    onChange(e) {
      const t = e.target;
      if (t.matches("[data-setting]") && t.type === "checkbox") return this.setSetting(t);
      if (t.matches("[data-tool-model]")) return this.setToolModel(t);
      if (t.matches("[data-key]")) return this.saveKey(t);
      if (t.matches("[data-edit-ch]")) return this.editChapter(t, true);
      if (t.matches("[data-beat]")) {
        const r = this.beatAt(t.dataset.beat);
        if (!r.beat) return;
        r.beat[1] = t.checked;
        this.save();
        this.planNow();
      }
    },
    onKeydown(e) {
      if (D.getElementById("palette")?.classList.contains("open")) return this.paletteKey(e);
      const t = e.target;
      if (t.matches?.("[data-menu-toggle]") && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
        const pop = D.querySelector(`[data-menu-pop="${t.dataset.menuToggle}"]`);
        if (pop?.getAttribute("role") === "menu") {
          e.preventDefault();
          this.closePops(pop);
          this.setMenu(t, pop, true, false);
          const items = this.menuItems(pop);
          return items[e.key === "ArrowUp" ? items.length - 1 : 0]?.focus();
        }
      }
      const menu = t.closest?.('[role="menu"]');
      if (menu && ["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
        const items = this.menuItems(menu);
        if (!items.length) return;
        e.preventDefault();
        const i = items.indexOf(t.closest('[role^="menuitem"]')),
          n = e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : i < 0 ? 0 : (i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        return items[n].focus();
      }
      if (t.matches?.("[data-settings-tab]") && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
        e.preventDefault();
        const ids = TABS.map((x) => x[0]),
          i = ids.indexOf(this.settingsTab),
          n = e.key === "Home" ? 0 : e.key === "End" ? ids.length - 1 : (i + (e.key === "ArrowRight" ? 1 : -1) + ids.length) % ids.length;
        return this.showTab(ids[n], true);
      }
      if (t.matches?.("[data-beat-text]") && e.key === "Enter" && !e.isComposing) {
        e.preventDefault();
        const r = this.beatAt(t.dataset.beatText);
        return W.Plan.addBeat(r.cid, "", true, r.i + 1);
      }
      if (t.matches?.("[data-key]") && e.key === "Enter") {
        e.preventDefault();
        return this.saveKey(t);
      }
    },
    onMousemove(e) {
      // Ignore synthetic events fired while the list scrolls under a resting pointer.
      const pos = `${e.clientX},${e.clientY}`;
      if (pos === this._lastPointer) return;
      this._lastPointer = pos;
      const cmd = e.target.closest?.(".cmd");
      if (!cmd || cmd.classList.contains("active")) return;
      const rows = [...D.querySelectorAll("#cmdList .cmd")];
      this.cmdIndex = rows.indexOf(cmd);
      rows.forEach((r) => {
        r.classList.toggle("active", r === cmd);
        r.setAttribute("aria-selected", String(r === cmd));
      });
      D.getElementById("cmdInput")?.setAttribute("aria-activedescendant", cmd.id);
    },
    wire() {
      const root = D.getElementById("app");
      // #app survives re-renders: app-level listeners are bound once; screen listeners are re-bound per render.
      if (!this._wired) {
        this._wired = true;
        // A click on a menu's padding moves focus nowhere; only real focus moves close the menu.
        root.addEventListener("pointerdown", (e) => (this._downWrap = e.target.closest?.(".menu-wrap") || null));
        root.addEventListener("focusout", (e) => {
          const wrap = e.target.closest?.(".menu-wrap"),
            pop = wrap?.querySelector(".menu-pop.open");
          if (!pop || wrap.contains(e.relatedTarget) || (!e.relatedTarget && this._downWrap === wrap)) return;
          this.setMenu(this.toggleOf(pop), pop, false);
        });
        root.addEventListener("click", (e) => this.onClick(e));
        root.addEventListener("input", (e) => this.onInput(e));
        root.addEventListener("change", (e) => this.onChange(e));
        root.addEventListener("keydown", (e) => this.onKeydown(e));
        root.addEventListener("mousemove", (e) => this.onMousemove(e));
        root.addEventListener("submit", (e) => {
          if (e.target.matches("[data-keys-form]")) return e.preventDefault();
          if (!e.target.matches("[data-signup-form]")) return;
          e.preventDefault();
          this.signupSubmit(e.target);
        });
      }
      this._screenAbort?.abort();
      this._screenAbort = new AbortController();
      const signal = this._screenAbort.signal;
      const scoped = new Proxy(root, {
        get: (t, k) =>
          k === "addEventListener"
            ? (type, fn, opts) => t.addEventListener(type, fn, { ...(typeof opts === "object" ? opts : { capture: !!opts }), signal })
            : typeof t[k] === "function"
              ? t[k].bind(t)
              : t[k],
      });
      ({ plan: W.Plan, write: W.Write, codex: W.Codex, inbox: W.Voice })[this.state.screen]?.wire(scoped);
    },
  };
  D.addEventListener("DOMContentLoaded", () => W.App.init());
})();
