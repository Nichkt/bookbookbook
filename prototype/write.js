(function () {
  "use strict";
  const W = window,
    D = document,
    UI = W.UI,
    DATA = W.BOOKBOOKBOOK_DATA;
  const S = () => W.App.state;
  const AI_OPEN = '<span class="ai-made" title="AI-generated · edit to make it yours">';
  const TAG_SRC = '<span class="ai-made"[^>]*>|</span>|<mark class="comment-mark" data-comment="[^"]*">|</mark>|</?[bi]>';
  const tagRe = () => new RegExp(TAG_SRC, "g");
  const PLACEHOLDER = "Not yet written. Start typing, or draft from your beats.";
  const DAILY = 1000;
  const enc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const encAttr = (s) => enc(s).replace(/"/g, "&quot;");
  const decode = (s) =>
    String(s).replace(/&(amp|lt|gt|quot);/g, (m, k) => ({ amp: "&", lt: "<", gt: ">", quot: '"' })[k]);
  const hhmm = () => new Date().toTimeString().slice(0, 5);
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const codexAll = () => W.Codex?.all?.() || DATA.codex;
  const sorted = () => [...S().chapters].sort((a, b) => a.n - b.n);
  function active() {
    const s = S();
    return s.chapters.find((c) => c.id === s.activeChapter) || sorted()[0];
  }
  function statusColor(s) {
    return {
      Idea: "#9A9488",
      Outlined: "#6B7FA6",
      Drafting: "#C98A2B",
      Revising: "#8A63B8",
      Done: "#3F7D58",
    }[s];
  }

  /* ---------- Stored prose format ----------
     Paragraphs are separated by a blank line; a single \n is a line break.
     "> " starts a block quote, "->…<-" centres a paragraph. Inline markup is limited to
     the AI tint span, comment marks, <b> and <i>; all other text is entity-encoded. */
  const paragraphs = (prose) =>
    String(prose || "")
      .split(/\n{2,}/)
      .filter((p) => p.trim());
  function block(p) {
    if (p.startsWith("> ")) return { cls: "quote", body: p.slice(2) };
    const m = /^->([\s\S]*)<-$/.exec(p);
    return m ? { cls: "center", body: m[1] } : { cls: "", body: p };
  }
  const wrapBlock = (cls, body) => (cls === "quote" ? "> " + body : cls === "center" ? "->" + body + "<-" : body);
  function tokens(body) {
    const re = tagRe(),
      out = [];
    let last = 0,
      m;
    while ((m = re.exec(body))) {
      if (m.index > last) out.push({ text: body.slice(last, m.index) });
      out.push({ tag: m[0] });
      last = re.lastIndex;
    }
    if (last < body.length) out.push({ text: body.slice(last) });
    return out;
  }
  let deco = { key: null };
  function decoRe() {
    const ids = new Map();
    codexAll().forEach((e) =>
      [e.name, ...(e.aliases || [])].forEach((n) => {
        n = String(n || "").trim();
        if (n && !ids.has(n)) ids.set(n, e.id);
      }),
    );
    const key = [...ids].map((x) => x.join("\u0001")).join("\u0002");
    if (key !== deco.key) {
      const names = [...ids.keys()]
        .sort((a, b) => b.length - a.length)
        .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      deco = {
        key,
        ids,
        re: new RegExp(
          `(?<![\\p{L}\\p{N}_])(?:(${names.join("|") || "(?!)"})|([Vv]ery|[Rr]eally|[Jj]ust|[Qq]uickly|[Ee]asily|[Nn]oticed|[Ss]aw|[Hh]eard|[Ff]elt)|(Their(?= (?:are|is|was|were)\\b)))(?![\\p{L}\\p{N}_])`,
          "gu",
        ),
      };
    }
    return deco;
  }
  const plainHTML = (s) => UI.esc(s).replace(/\n/g, "<br>");
  // An ignored grammar flag is remembered by the phrase it starts (first four words).
  const ignoreKey = (s) => String(s).replace(/\s+/g, " ").trim().split(" ").slice(0, 4).join(" ");
  function decorate(txt, d) {
    const re = d.re,
      ignored = S().ignoredChecks || [];
    re.lastIndex = 0;
    let out = "",
      last = 0,
      m;
    while ((m = re.exec(txt))) {
      out += plainHTML(txt.slice(last, m.index));
      const w = UI.esc(m[0]);
      if (m[1]) out += `<span class="mention" data-codex="${UI.esc(d.ids.get(m[1]))}">${w}</span>`;
      else if (m[2])
        out += `<span class="check-wavy" title="${/^(noticed|saw|heard|felt)$/i.test(m[2]) ? "Filter verb: show the thing itself?" : "Intensifier: cut it or pick a sharper word?"}">${w}</span>`;
      else if (ignored.includes(ignoreKey(txt.slice(m.index, m.index + 80)))) out += w;
      else out += `<span class="grammar" data-fix="There">${w}</span>`;
      last = re.lastIndex;
    }
    return out + plainHTML(txt.slice(last));
  }
  // Tags are re-balanced per paragraph so stored markup can never break the page.
  function inline(body, mode, d) {
    const out = [],
      stack = [];
    for (const t of tokens(body)) {
      if (t.text != null) {
        out.push(mode === "edit" ? decorate(decode(t.text), d) : plainHTML(decode(t.text)));
        continue;
      }
      const close = t.tag.startsWith("</"),
        name = close ? t.tag.slice(2, -1) : /^<(\w+)/.exec(t.tag)[1];
      if (mode === "read" && name !== "b" && name !== "i") continue;
      if (close) {
        const at = stack.lastIndexOf(name);
        if (at < 0) continue;
        while (stack.length > at) out.push(`</${stack.pop()}>`);
        continue;
      }
      stack.push(name);
      if (name === "span") out.push(AI_OPEN);
      else if (name === "mark")
        out.push(`<mark class="comment-mark" data-comment="${encAttr(decode(/data-comment="([^"]*)"/.exec(t.tag)[1]))}">`);
      else out.push(`<${name}>`);
    }
    while (stack.length) out.push(`</${stack.pop()}>`);
    return out.join("");
  }
  function paraHTML(p, mode, d) {
    const { cls, body } = block(p),
      inner = inline(body, mode, d);
    return `<p${cls ? ` class="${cls}"` : ""}>${inner.replace(/<[^>]*>/g, "") ? inner : inner + "<br>"}</p>`;
  }
  function proseHTML(prose, mode = "edit") {
    const ps = paragraphs(prose);
    if (!ps.length) return mode === "edit" ? "<p><br></p>" : "";
    const d = mode === "edit" ? decoRe() : null;
    return ps.map((p) => paraHTML(p, mode, d)).join("");
  }

  /* ---------- Counting ---------- */
  const plainPara = (p) => decode(block(p).body.replace(tagRe(), ""));
  const plainParas = (prose) => paragraphs(prose).map(plainPara);
  const wc = (s) => (String(s || "").match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;
  const proseWords = (prose) => plainParas(prose).reduce((n, p) => n + wc(p), 0);
  const hasText = (prose) => plainParas(prose).some((p) => p.trim());
  function aiWords(prose) {
    let n = 0;
    String(prose || "").replace(/<span class="ai-made"[^>]*>([\s\S]*?)<\/span>/g, (m, inner) => {
      n += wc(decode(inner.replace(tagRe(), "")));
      return m;
    });
    return n;
  }
  function aiPct(list) {
    let a = 0,
      t = 0;
    list.forEach((p) => {
      a += aiWords(p);
      t += proseWords(p);
    });
    return t ? Math.round((a / t) * 100) : 0;
  }
  function mentionCounts(c) {
    const d = decoRe(),
      out = {};
    (c?.scenes || []).forEach((sc) =>
      plainParas(sc.prose).forEach((t) => {
        d.re.lastIndex = 0;
        let m;
        while ((m = d.re.exec(t))) {
          if (!m[1]) continue;
          const id = d.ids.get(m[1]);
          out[id] = (out[id] || 0) + 1;
        }
      }),
    );
    return out;
  }

  /* ---------- DOM → stored prose ---------- */
  const BLOCK_TAGS = new Set(["P", "DIV", "BLOCKQUOTE", "H1", "H2", "H3", "H4", "H5", "H6", "LI", "UL", "OL", "SECTION", "ARTICLE", "PRE"]);
  function ser(n) {
    if (n.nodeType === 3) return enc(n.nodeValue.replace(/[\u00a0\n\r]/g, " "));
    if (n.nodeType !== 1) return "";
    if (n.tagName === "BR") return "\n";
    const k = [...n.childNodes].map(ser).join("");
    if (n.classList.contains("ai-made")) return k ? AI_OPEN + k + "</span>" : "";
    if (n.classList.contains("comment-mark")) {
      const note = (n.dataset.comment || "").replace(/\s+/g, " ").trim();
      return note && k ? `<mark class="comment-mark" data-comment="${encAttr(note)}">${k}</mark>` : k;
    }
    if (!k) return "";
    const st = n.style || {};
    if (n.tagName === "B" || n.tagName === "STRONG" || st.fontWeight === "bold" || +st.fontWeight >= 600) return `<b>${k}</b>`;
    if (n.tagName === "I" || n.tagName === "EM" || st.fontStyle === "italic") return `<i>${k}</i>`;
    return k;
  }
  function serialize(root) {
    const paras = [];
    const push = (cls, html) => {
      html = html.replace(/\n{2,}/g, "\n").replace(/^\n+|\n+$/g, "");
      if (!html.replace(tagRe(), "").trim()) return;
      paras.push(wrapBlock(cls, html));
    };
    const walk = (el, cls) => {
      let run = "";
      for (const n of el.childNodes) {
        if (n.nodeType === 1 && BLOCK_TAGS.has(n.tagName)) {
          if (run) push(cls, run);
          run = "";
          const c2 =
            n.tagName === "BLOCKQUOTE" || n.classList.contains("quote") ? "quote" : n.classList.contains("center") ? "center" : cls;
          if ([...n.children].some((k) => BLOCK_TAGS.has(k.tagName))) walk(n, c2);
          else push(c2, ser(n));
        } else run += ser(n);
      }
      if (run) push(cls, run);
    };
    walk(root, "");
    return paras.join("\n\n");
  }

  /* ---------- Sync (debounced; flushed before any re-render) ---------- */
  function sceneOf(key) {
    const [cid, sid] = String(key || "").split(":");
    const c = S().chapters.find((x) => x.id === cid);
    return { c, sc: c?.scenes?.find((x) => x.id === sid), cid, sid };
  }
  const proseOf = (node) => (node?.nodeType === 1 ? node : node?.parentElement)?.closest?.(".prose[data-scene]") || null;
  const paraAt = (node) => (node?.nodeType === 1 ? node : node?.parentElement)?.closest?.(".prose p") || null;
  const proseByKey = (key) => [...D.querySelectorAll(".prose[data-scene]")].find((p) => p.dataset.scene === key) || null;
  const setEmpty = (el) => el.toggleAttribute("data-empty", !el.textContent.trim());
  const pending = new Map();
  function queueSync(el) {
    const k = el.dataset.scene;
    clearTimeout(pending.get(k)?.t);
    pending.set(k, { el, t: setTimeout(() => syncProse(el), 400) });
  }
  function flush() {
    [...pending.values()].forEach(({ el }) => syncProse(el));
  }
  function applyDelta(c, d) {
    if (!d || !c) return;
    const st = S();
    c.words = Math.max(0, (c.words || 0) + d);
    st.today = Math.max(0, (st.today ?? 512) + d);
    if (W.Write._sprint) W.Write._sprint.words = Math.max(0, W.Write._sprint.words + d);
  }
  function syncProse(el) {
    if (!el) return;
    const k = el.dataset.scene,
      p = pending.get(k);
    if (p) {
      clearTimeout(p.t);
      pending.delete(k);
    }
    if (!el.isConnected) return;
    const { c, sid } = sceneOf(k);
    let { sc } = sceneOf(k);
    if (!c) return;
    const prose = serialize(el);
    let created = false;
    if (!sc) {
      if (!prose) return;
      c.scenes = c.scenes || [];
      sc = { id: sid, title: "Scene " + (c.scenes.length + 1), pov: c.pov, prose: "" };
      c.scenes.push(sc);
      created = true;
    }
    if (prose === sc.prose) return;
    applyDelta(c, proseWords(prose) - proseWords(sc.prose));
    sc.prose = prose;
    W.App.save();
    updateCounts(c);
    if (created) refreshNav();
  }
  function refreshProse(el, keepCaret) {
    if (!el?.isConnected) return;
    const pos = keepCaret ? posOf(el) : null;
    el.innerHTML = proseHTML(sceneOf(el.dataset.scene).sc?.prose || "");
    setEmpty(el);
    if (pos) setSel(el, pos);
  }

  /* ---------- Caret model: text offsets inside one scene ---------- */
  function offsetIn(el, node, off) {
    const r = D.createRange();
    r.selectNodeContents(el);
    try {
      r.setEnd(node, off);
    } catch (e) {
      return 0;
    }
    return r.toString().length;
  }
  function pointAt(el, n, start) {
    const w = D.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let t,
      last = null;
    while ((t = w.nextNode())) {
      if (n < t.length || (n === t.length && !start)) return [t, n];
      n -= t.length;
      last = t;
    }
    if (last) return [last, last.length];
    return [el.querySelector("p") || el, 0];
  }
  function paraIndex(el, node) {
    const p = paraAt(node);
    return p && el.contains(p) ? [...el.querySelectorAll("p")].indexOf(p) : -1;
  }
  function posOf(el, sel = getSelection()) {
    if (!el || !sel.rangeCount || !el.contains(sel.anchorNode)) return null;
    const a = offsetIn(el, sel.anchorNode, sel.anchorOffset),
      inF = el.contains(sel.focusNode);
    return {
      key: el.dataset.scene,
      a,
      as: sel.anchorOffset === 0,
      f: inF ? offsetIn(el, sel.focusNode, sel.focusOffset) : a,
      fs: inF ? sel.focusOffset === 0 : sel.anchorOffset === 0,
      pi: paraIndex(el, sel.anchorNode),
    };
  }
  function setSel(el, pos) {
    getSelection().setBaseAndExtent(...pointAt(el, pos.a, pos.as), ...pointAt(el, pos.f, pos.fs));
  }
  function rangeFrom(el, pos) {
    const fwd = pos.a <= pos.f,
      r = D.createRange();
    r.setStart(...pointAt(el, fwd ? pos.a : pos.f, fwd ? pos.as : pos.fs));
    r.setEnd(...pointAt(el, fwd ? pos.f : pos.a, fwd ? pos.fs : pos.as));
    return r;
  }
  /* ---------- Markup ---------- */
  const settingsOf = () => S().settings;
  let seq = 0;
  const newId = (p) => p + Date.now().toString(36) + (seq++).toString(36);
  function ensureIds() {
    (S().aiCards || []).forEach((c) => {
      if (!c.id) c.id = newId("ai");
      if (c.credits == null) c.credits = "0.6";
    });
  }
  const UNITS = [
    ["scene", "Scene", "Just the current scene"],
    ["chapter", "Chapter", "Every scene in this chapter"],
    ["manuscript", "Manuscript", "The whole book in one scroll"],
  ];
  const AI_MENU = ["Guided continue", "Expand", "Condense", "Brainstorm", "Draft from beats", "Feedback", "Dialogue polish", "Name generator", "Summarize"];
  const VIEW = [
    ["focus", "Focus mode", "Ctrl+."],
    ["typewriter", "Typewriter scrolling", ""],
    ["aiTint", "AI tint", ""],
    ["proseChecks", "Prose checks", ""],
  ];
  function viewOn(k) {
    const s = settingsOf();
    if (k === "focus") return D.body.classList.contains("focus-mode");
    if (k === "typewriter") return !!s.typewriter;
    return s[k] !== false;
  }
  function navChapter(c, cur) {
    const on = c.id === cur.id;
    return `<button class="nav-item${on ? " active" : ""}" data-go-ch="${c.id}"${on ? ' aria-current="true"' : ""}><span><span class="dot ${c.status}" style="background:${statusColor(c.status)}" title="${c.status}"></span>${c.n} · ${UI.esc(c.title)}</span><small>${(c.words || 0).toLocaleString()}</small></button>${(c.scenes || [])
      .map(
        (s, i) =>
          `<button class="nav-item scene-row${on && S().activeScene === s.id ? " active" : ""}" data-go-ch="${c.id}" data-go-sc="${s.id}">${UI.esc(s.title || "Scene " + (i + 1))}</button>`,
      )
      .join("")}`;
  }
  function nav() {
    const cur = active(),
      shut = S().collapsedActs || {};
    return `<aside class="left-pane" id="leftPane" aria-label="Navigator"><div class="subbar nav-head"><strong>Navigator</strong><span class="spacer"></span><button class="icon-btn" data-toggle-left data-pane-close aria-label="Hide navigator">${UI.icon("x")}</button></div>${DATA.acts
      .map(
        (a) =>
          `<div class="nav-act${shut[a.id] ? " collapsed" : ""}"><button class="act-toggle" data-act-toggle="${a.id}" aria-expanded="${!shut[a.id]}"><span class="chev" aria-hidden="true">⌄</span>${UI.esc(a.title)}</button><div class="nav-act-body"${shut[a.id] ? " hidden" : ""}>${sorted()
            .filter((c) => c.act === a.id)
            .map((c) => navChapter(c, cur))
            .join("")}</div></div>`,
      )
      .join("")}<button class="small-btn nav-add" data-add-chapter>${UI.icon("plus")} Chapter</button></aside>`;
  }
  function refreshNav() {
    const old = D.getElementById("leftPane");
    if (!old) return;
    const f = old.contains(D.activeElement) ? D.activeElement.dataset : null,
      top = old.scrollTop,
      t = D.createElement("div");
    t.innerHTML = nav();
    const nu = t.firstElementChild;
    nu.classList.toggle("open", old.classList.contains("open"));
    old.replaceWith(nu);
    nu.scrollTop = top;
    const sel = !f
      ? null
      : f.actToggle
        ? `[data-act-toggle="${f.actToggle}"]`
        : f.goCh
          ? `[data-go-ch="${f.goCh}"]${f.goSc ? `[data-go-sc="${f.goSc}"]` : ":not([data-go-sc])"}`
          : null;
    if (sel) nu.querySelector(sel)?.focus();
  }
  function sprintChip() {
    const sp = W.Write._sprint,
      left = Math.max(0, 1500 - Math.floor((Date.now() - sp.start) / 1000));
    return `<span class="sprint-chip" role="timer" title="Writing sprint">${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")} · ${sp.words.toLocaleString()} words</span>`;
  }
  const menuBtn = (id, cls, label, inner, title) =>
    `<button class="${cls}" data-menu-toggle="${id}" aria-haspopup="menu" aria-expanded="false" aria-label="${label}" title="${title || label}">${inner}</button>`;
  function toolbar() {
    const s = settingsOf(),
      u = UNITS.find((x) => x[0] === s.unit) || UNITS[1],
      sp = W.Write._sprint;
    return `<div class="editor-toolbar" role="toolbar" aria-label="Editor"><div class="toolbar-strip">
      <button class="icon-btn" data-toggle-left aria-controls="leftPane" aria-expanded="${paneVisible("left", true)}" title="Navigator" aria-label="Navigator">${UI.icon("book")}</button>
      <div class="menu-wrap unit-menu">${menuBtn("unit", "small-btn unit-btn", "Editing unit: " + u[1], u[1] + " ▾", "Editing unit")}<div class="menu-pop" data-menu-pop="unit" role="menu" aria-label="Editing unit">${UNITS.map(([k, label, hint]) => `<button role="menuitemradio" aria-checked="${s.unit === k}" data-unit="${k}" class="${s.unit === k ? "active" : ""}"><b>${label}</b><small>${hint}</small></button>`).join("")}</div></div>
      <button class="icon-btn" data-format="B" aria-pressed="false" title="Bold (Ctrl+B)" aria-label="Bold"><b>B</b></button><button class="icon-btn" data-format="I" aria-pressed="false" title="Italic (Ctrl+I)" aria-label="Italic"><i>I</i></button><button class="icon-btn" data-format="break" title="Scene break: split the scene at the cursor" aria-label="Scene break">✦</button><button class="icon-btn" data-format="quote" aria-pressed="false" title="Block quote" aria-label="Block quote">${UI.icon("quote")}</button><button class="icon-btn" data-format="center" aria-pressed="false" title="Center paragraph" aria-label="Center paragraph">≡</button>
      <div class="menu-wrap ai-split"><button class="pill-btn active ai-main" data-ai="Continue" title="Continue (Ctrl+J)">${UI.icon("spark")} AI</button>${menuBtn("ai-tools", "pill-btn active split-caret", "More AI tools", "▾")}<div class="menu-pop" data-menu-pop="ai-tools" role="menu" aria-label="AI tools">${AI_MENU.map((t) => `<button role="menuitem" data-ai="${t}">${t}</button>`).join("")}</div></div>
      <button class="icon-btn" data-ai="Rewrite" title="Rewrite selection" aria-label="Rewrite">${UI.icon("pen")}</button><button class="icon-btn" data-ai="Describe" title="Describe" aria-label="Describe">${UI.icon("spark")}</button>
      <button class="icon-btn" data-dictate aria-pressed="false" aria-label="Dictate" title="Dictate at cursor">${UI.icon("mic")}</button>
      <div class="menu-wrap">${menuBtn("view-menu", "icon-btn", "View options", UI.icon("eye"), "View")}<div class="menu-pop" data-menu-pop="view-menu" role="menu" aria-label="View">${VIEW.map(([k, label, kbd]) => `<button role="menuitemcheckbox" aria-checked="${viewOn(k)}" data-view-toggle="${k}">${label}${kbd ? ` <small>${kbd}</small>` : ""}</button>`).join("")}<button role="menuitem" data-read-aloud>${W.Write._speaking ? "Stop reading aloud" : "Read aloud"}</button><button role="menuitem" data-read-through>Read-through</button></div></div>
      <div class="menu-wrap">${menuBtn("tools-menu", "icon-btn", "Writing tools", UI.icon("clock"), "Tools")}<div class="menu-pop" data-menu-pop="tools-menu" role="menu" aria-label="Tools"><button role="menuitem" data-sprint>${sp ? "End sprint" : "Start 25-min sprint"}</button><button role="menuitem" data-find>Find & replace <small>Ctrl+Shift+F</small></button><button role="menuitem" data-snapshots>Snapshots</button></div></div>
      ${sp ? sprintChip() : ""}<span class="spacer"></span>
      <button class="icon-btn" data-toggle-right aria-controls="rightPane" aria-expanded="${paneVisible("right", true)}" title="Side panel" aria-label="Side panel">${UI.icon("panel")}</button>
    </div></div>`;
  }
  function sceneSection(sc, i, c, solo, ph) {
    const key = `${c.id}:${sc.id}`,
      f = !ph && !solo && !!(S().foldedScenes || {})[key];
    const head = ph
      ? `<span>Scene 1:</span> <span class="scene-title">${UI.esc(c.title)}</span>`
      : `${solo ? "" : `<button class="fold-btn" data-fold="${key}" aria-expanded="${!f}" aria-label="${f ? "Show" : "Fold"} scene ${i + 1}"><span class="chev" aria-hidden="true">⌄</span></button>`}<span>Scene ${i + 1}:</span> <span class="scene-title" contenteditable="plaintext-only" role="textbox" aria-label="Scene ${i + 1} title" spellcheck="false" data-scene-title="${key}">${UI.esc(sc.title || "")}</span>`;
    return `<section class="scene${f ? " folded" : ""}" data-scene-key="${key}"><div class="scene-head">${head} <span class="scene-pov">· ${UI.esc(sc.pov || c.pov || "")}</span></div><p class="fold-note"${f ? "" : " hidden"}><span class="fold-words">${proseWords(sc.prose).toLocaleString()} words folded</span> <button class="link-btn" data-fold="${key}">Show</button></p><div class="prose" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Chapter ${c.n}, scene ${i + 1} text" spellcheck="true" data-scene="${key}" data-placeholder="${PLACEHOLDER}"${hasText(sc.prose) ? "" : " data-empty"}${f ? " hidden" : ""}>${proseHTML(sc.prose)}</div>${!solo && i < (c.scenes || []).length - 1 ? `<div class="divider" aria-hidden="true">✦ ✦ ✦</div>` : ""}</section>`;
  }
  function chapterBody(c) {
    if (c.scenes?.length) return c.scenes.map((sc, i) => sceneSection(sc, i, c)).join("");
    const n = (c.beats || []).length;
    return (
      sceneSection({ id: c.id + "s0", title: c.title, pov: c.pov, prose: "" }, 0, c, true, true) +
      `<div class="empty-actions"><button class="small-btn" data-draft-ch="${c.id}">${UI.icon("spark")} Draft from beats</button><small>${n} beat${n === 1 ? "" : "s"} planned</small></div>`
    );
  }
  function page() {
    const s = settingsOf(),
      c = active();
    let body;
    if (s.unit === "manuscript")
      body = sorted()
        .map((ch) => `<h1 data-ms-ch="${ch.id}">Chapter ${ch.n} · ${UI.esc(ch.title)}</h1>${chapterBody(ch)}`)
        .join("");
    else if (s.unit === "scene" && c.scenes?.length) {
      const idx = Math.max(0, c.scenes.findIndex((x) => x.id === S().activeScene)),
        n = c.scenes.length;
      body = `<h1>Chapter ${c.n} · ${UI.esc(c.title)}</h1><div class="scene-step"><button class="small-btn" data-step-scene="-1"${idx ? "" : " disabled"} aria-label="Previous scene">‹</button><span>Scene ${idx + 1} of ${n}</span><button class="small-btn" data-step-scene="1"${idx < n - 1 ? "" : " disabled"} aria-label="Next scene">›</button></div>${sceneSection(c.scenes[idx], idx, c, true)}`;
    } else body = `<h1>Chapter ${c.n} · ${UI.esc(c.title)}</h1>${chapterBody(c)}`;
    const cls = (s.aiTint === false ? " no-ai-tint" : "") + (s.proseChecks === false ? " no-prose-checks" : "");
    return `<div class="editor-shell${s.typewriter ? " typewriter" : ""}">${toolbar()}<div class="page-scroll"><article class="page${cls}">${body}</article>${s.unit === "manuscript" ? `<div class="ms-end" aria-hidden="true"></div>` : ""}</div><div class="footerbar">${footerHTML()}</div></div>`;
  }
  function footerHTML() {
    const s = settingsOf(),
      st = S(),
      c = active(),
      ms = s.unit === "manuscript";
    const pct = aiPct((ms ? st.chapters : [c]).flatMap((x) => (x.scenes || []).map((sc) => sc.prose)));
    const first = ms
      ? `<span>${st.chapters.reduce((m, x) => m + (x.words || 0), 0).toLocaleString()} words</span><span>manuscript</span>`
      : `<span>${(c.words || 0).toLocaleString()} words</span><span>chapter goal ${(c.target || 0).toLocaleString()} (${c.target ? Math.round(((c.words || 0) / c.target) * 100) : 0}%)</span>`;
    return `${first}<span>today ${(st.today ?? 512).toLocaleString()} / ${DAILY.toLocaleString()}</span><span>${pct}% AI-assisted</span><span>Saved locally</span>`;
  }
  function updateCounts(c) {
    const f = D.querySelector(".footerbar");
    if (f) f.innerHTML = footerHTML();
    const n = c && D.querySelector(`#leftPane .nav-item[data-go-ch="${c.id}"]:not(.scene-row) small`);
    if (n) n.textContent = (c.words || 0).toLocaleString();
    W.App.updateRing?.();
    const chip = D.querySelector(".sprint-chip");
    if (chip && W.Write._sprint) chip.outerHTML = sprintChip();
  }

  /* ---------- Side panes ---------- */
  const wide = (side) => innerWidth >= (side === "left" ? 761 : 1101);
  function paneVisible(side, rendering) {
    const s = settingsOf();
    if (wide(side)) return !(side === "left" ? s.hideLeft : s.hideRight);
    return !rendering && !!D.getElementById(side + "Pane")?.classList.contains("open");
  }
  function syncPaneButtons() {
    ["left", "right"].forEach((side) =>
      D.querySelectorAll(`.editor-toolbar [data-toggle-${side}]`).forEach((b) => b.setAttribute("aria-expanded", String(paneVisible(side)))),
    );
  }
  function togglePane(side, show, fromClose, quiet) {
    const pane = D.getElementById(side + "Pane");
    if (!pane) return;
    show = show ?? !paneVisible(side);
    const hadFocus = pane.contains(D.activeElement);
    if (wide(side)) {
      settingsOf()[side === "left" ? "hideLeft" : "hideRight"] = !show;
      D.querySelector(".write-layout")?.classList.toggle("hide-" + side, !show);
      W.App.save();
    } else pane.classList.toggle("open", show);
    syncPaneButtons();
    if (quiet) return;
    if (show && !wide(side))
      pane.querySelector(side === "left" ? ".nav-item.active,.nav-item" : '[role=tab][aria-selected="true"]')?.focus();
    if (!show && (fromClose || hadFocus)) D.querySelector(`.editor-toolbar [data-toggle-${side}]`)?.focus();
  }
  const showRight = () => paneVisible("right") || togglePane("right", true, false, true);

  /* ---------- Right panel ---------- */
  const TABS = ["Plan", "Codex", "AI"];
  const rightPanel = () => `<aside class="right-pane" id="rightPane" aria-label="Side panel">${rightInner()}</aside>`;
  function rightInner() {
    const t = TABS.includes(S().rightTab) ? S().rightTab : "AI";
    return `<div class="right-tabs"><div role="tablist" aria-label="Side panel">${TABS.map((x) => `<button class="small-btn${x === t ? " active" : ""}" role="tab" id="rtab-${x}" aria-selected="${x === t}" aria-controls="rightBody" tabindex="${x === t ? 0 : -1}" data-right-tab="${x}">${x}</button>`).join("")}</div><span class="spacer"></span><button class="icon-btn" data-toggle-right data-pane-close aria-label="Hide side panel">${UI.icon("x")}</button></div><div class="right-body" id="rightBody" role="tabpanel" aria-labelledby="rtab-${t}">${t === "Plan" ? planTab() : t === "Codex" ? codexTab() : aiTab()}</div>`;
  }
  function refreshRight(focusTab) {
    const p = D.getElementById("rightPane");
    if (!p) return;
    p.innerHTML = rightInner();
    W.Write.autogrow();
    if (focusTab) p.querySelector('[role=tab][aria-selected="true"]')?.focus();
  }
  const micBtn = (kind, label) =>
    `<button class="icon-btn mini" data-inline-mic="${kind}" aria-label="Dictate ${label}" title="Dictate ${label}">${UI.icon("mic")}</button>`;
  function planTab() {
    const c = active();
    return `<h3>Chapter ${c.n} plan</h3><div class="field"><span class="label-row"><label for="wSummary">Summary</label>${micBtn("summary", "summary")}</span><textarea id="wSummary" data-edit-ch="${c.id}:summary">${UI.esc(c.summary || "")}</textarea></div><div class="field"><span class="label-row"><span>Beats</span>${micBtn("beats", "a beat")}</span>${W.Plan?.beatRows ? W.Plan.beatRows(c, "write") : ""}</div><div class="field"><span class="label-row"><label for="wNotes">Notes</label>${micBtn("notes", "notes")}</span><textarea id="wNotes" data-edit-ch="${c.id}:notes" placeholder="Notes for this chapter">${UI.esc(c.notes || "")}</textarea></div><p>${UI.status(c.status)} <span class="tag">${UI.esc(c.pov || "")}</span> <span class="tag">${(c.target || 0).toLocaleString()} target</span></p>`;
  }
  const codexTab = () =>
    `<input type="search" class="small-btn codex-quick" data-codex-quick aria-label="Search codex" placeholder="Search codex" value="${UI.esc(W.Write._cq || "")}"><div id="codexQuick" aria-live="polite">${codexQuickHTML(W.Write._cq || "")}</div>`;
  const codexRow = (e, n) =>
    `<div class="codex-row"><b>${UI.esc(UI.cap(e.name))}</b>${n ? ` <small class="tag">${n}×</small>` : ""}<br><small>${UI.esc(UI.singular(e.type))} · ${Object.values(e.fields || {})
      .slice(0, 2)
      .map((v) => UI.esc(v))
      .join(" · ")}</small><p><button class="small-btn" data-open-codex="${e.id}">Open in Codex</button></p></div>`;
  function codexQuickHTML(q) {
    const all = codexAll();
    q = String(q).trim().toLowerCase();
    if (!q) {
      const n = mentionCounts(active());
      const here = all.filter((e) => n[e.id] || e.context === "Always").sort((a, b) => (n[b.id] || 0) - (n[a.id] || 0));
      return `<h3>In this chapter</h3>${here.map((e) => codexRow(e, n[e.id])).join("") || `<p class="muted">No codex entries mentioned yet.</p>`}`;
    }
    const hits = all.filter((e) => [e.name, ...(e.aliases || []), ...(e.tags || [])].some((x) => String(x).toLowerCase().includes(q)));
    return `<h3>${hits.length} result${hits.length === 1 ? "" : "s"}</h3>${hits.map((e) => codexRow(e)).join("") || `<p class="muted">No matches.</p>`}`;
  }
  const TOOLS = ["Continue", "Rewrite", "Describe", "Expand", "Condense", "Brainstorm", "Summarize", "Dialogue polish", "Name generator", "Draft from beats", "Feedback"];
  const ICONS = { Continue: "play", Rewrite: "pen", Describe: "spark", Expand: "plus", Condense: "shrink", Brainstorm: "palette", Summarize: "list", "Dialogue polish": "quote", "Name generator": "user", "Draft from beats": "book", Feedback: "thumbs" };
  const MODELS = [
    ["Hosted · credits", [["Claude Sonnet $$", 1.2], ["GPT-5 mini $", 0.6], ["Gemini Pro $$", 1.1], ["Opus-class $$$", 3.0]]],
    ["Your keys", [["OpenRouter: any model", "key"]]],
    ["Local", [["Ollama · llama3.1:8b (free)", "local"]]],
  ];
  const curModel = () => (MODELS.some((g) => g[1].some((m) => m[0] === S().aiModel)) ? S().aiModel : "GPT-5 mini $");
  const modelCost = (m) => MODELS.flatMap((g) => g[1]).find((x) => x[0] === m)?.[1] ?? 0.6;
  // Settings → "Default model per tool" overrides the panel's picker for that tool.
  const toolModel = (t) => {
    const m = (settingsOf().toolModels || {})[t === "Chapter feedback" ? "Feedback" : t];
    return m && MODELS.some((g) => g[1].some((x) => x[0] === m)) ? m : curModel();
  };
  function creditsText() {
    const c = modelCost(curModel()),
      left = (S().credits ?? 1240).toLocaleString(undefined, { maximumFractionDigits: 1 });
    return c === "key" ? `Billed to your OpenRouter key · ${left} credits untouched` : c === "local" ? "Runs on this device · free" : `${left} credits left · estimate ~${c}`;
  }
  const CONTEXT = [
    ["style", "Style guide", 320],
    ["beats", "Chapter beats + summary", 410],
    ["prev", "Previous summaries", 180],
    ["codex", "Codex mentioned", 1240],
    ["pinned", "Pinned codex", 520],
    ["before", "Text before cursor", 4750],
  ];
  const LIMIT = 12000;
  const tokenTotal = () => CONTEXT.reduce((n, r) => n + ((S().contextOff || {})[r[0]] ? 0 : r[2]), 0);
  const EMPTY_AI = `<p class="ai-empty muted">Results appear here. Select text for rewrites, or press Ctrl+J to continue from the cursor.</p>`;
  function aiTab() {
    const off = S().contextOff || {},
      total = tokenTotal(),
      cards = S().aiCards || [];
    return `<div class="tool-grid">${TOOLS.map((t) => `<button class="tool-tile" data-ai="${t}"><span>${UI.icon(ICONS[t] || "spark")}</span>${t}</button>`).join("")}</div>
      <h4>Your tools</h4><div class="tool-grid your-tools"><button class="tool-tile" data-ai="Add a sensory anchor"><span>${UI.icon("spark")}</span>Add sensory anchor</button><button class="tool-tile" data-custom-tool><span>${UI.icon("plus")}</span>New tool</button></div>
      <label class="field compact-field">Model<select id="aiModel">${MODELS.map(([g, opts]) => `<optgroup label="${g}">${opts.map(([o]) => `<option${curModel() === o ? " selected" : ""}>${o}</option>`).join("")}</optgroup>`).join("")}</select></label><p class="chip" id="aiCredits">${creditsText()}</p>
      <div id="aiHistory">${cards.length ? cards.map(cardHTML).join("") : EMPTY_AI}</div>
      <details class="context-preview"><summary>Context preview · <span id="tokenSum">${total.toLocaleString()}</span> tokens</summary>${CONTEXT.map(([k, label, n]) => `<label class="context-row"><span><input type="checkbox" data-token="${n}" data-token-key="${k}"${off[k] ? "" : " checked"}> ${label}</span><small>${n.toLocaleString()} tok</small></label>`).join("")}<div class="meter" aria-hidden="true"><span style="width:${Math.min(100, total / 120).toFixed(1)}%"></span></div><small id="tokenTotal">${total.toLocaleString()} of ${LIMIT.toLocaleString()} tokens</small></details>`;
  }

  /* ---------- AI cards ---------- */
  const NO_INSERT = new Set(["Chapter feedback", "Feedback", "Brainstorm", "Name generator", "Summarize"]);
  const creditLabel = (card) => (card.credits === "key" ? "your key" : card.credits === "local" ? "local · free" : `~${card.credits} credits`);
  function cardText(card) {
    if (card.kind === "describe") return Object.entries(card.groups || {}).map(([k, v]) => `${k}: ${v}`).join("\n");
    return card.body && !Array.isArray(card.body) ? card.body : (card.variants || []).join("\n\n");
  }
  function bodyHTML(card, body) {
    if (!body) return "";
    if (!body.includes("\n")) return `<p>${UI.esc(body)}</p>`;
    const tag = /^\d+\.\s/.test(body) ? "ol" : "ul";
    const items = body
      .split("\n")
      .map((l) => `<li>${UI.esc(l.replace(/^\d+\.\s*/, "")).replace(/^([^:]{2,24}):/, "<b>$1:</b>")}</li>`)
      .join("");
    return `<${tag} class="ai-list${card.tool === "Name generator" ? " cols-2" : ""}">${items}</${tag}>`;
  }
  function cardHTML(card) {
    const id = UI.esc(card.id),
      body = Array.isArray(card.body) ? "" : card.body || "";
    const variants = (card.variants || [])
      .map((v, i) => `<blockquote>${UI.esc(v)}</blockquote><button class="small-btn" data-insert-ai="${id}" data-variant="${i}">Insert</button>`)
      .join("");
    const extra =
      card.kind === "describe"
        ? Object.entries(card.groups || {})
            .map(([k, v]) => `<h4>${UI.esc(k)}</h4><p>${UI.esc(v)}</p><button class="small-btn" data-insert-ai="${id}" data-group="${UI.esc(k)}">Insert line</button>`)
            .join("")
        : card.kind === "summarize"
          ? `<button class="small-btn" data-apply-summary="${id}">Apply to chapter card</button>`
          : "";
    const main = body && !NO_INSERT.has(card.tool) ? `<button class="small-btn" data-insert-ai="${id}">Insert</button>` : "";
    const retry = card.tool === "Chapter feedback" ? "Feedback" : card.tool;
    return `<article class="ai-card" data-card-id="${id}" data-ai-card="${UI.esc(card.tool)}" aria-label="${UI.esc(card.tool)} result"><header class="ai-card-head"><span>${UI.icon("spark")}</span><b>${UI.esc(card.tool)}${card.preset ? ` · ${UI.esc(card.preset)}` : ""}</b><small>${UI.esc(card.time || "")} · ${UI.esc(card.model || "GPT-5 mini")} · ${creditLabel(card)}</small></header>${bodyHTML(card, body)}${variants}${extra}<div class="ai-actions">${main}<button class="small-btn" data-copy="${id}">Copy</button><button class="small-btn" data-ai="${UI.esc(retry)}"${card.preset ? ` data-preset="${UI.esc(card.preset)}"` : ""}>Retry</button><button class="small-btn" data-dismiss-card="${id}">Dismiss</button><button class="icon-btn" data-rate="up" aria-pressed="${card.rating === "up"}" aria-label="Good result">${UI.icon("thumbs")}</button><button class="icon-btn" data-rate="down" aria-pressed="${card.rating === "down"}" aria-label="Poor result">${UI.icon("thumbsDown")}</button></div></article>`;
  }
  function buildCard(tool) {
    const base = { tool };
    const variants = {
      Continue: [
        "Mara waited until the rain softened the windows, then opened the ledger as if it might object.",
        "Jonas's laugh broke first; Elias looked toward the bar, and Mara knew the debt had found the room before she had.",
      ],
      "Guided continue": [
        "Jonas lied about the debt with the exhausted neatness of a man folding a sail in a storm.",
        "Mara heard the lie because it was the first thing Jonas had said all evening without a joke attached.",
      ],
      Rewrite: DATA.aiOutputs.Rewrite,
      Expand: [
        "The ledger in Mara's satchel seemed heavier than paper should be, as though each impossible ship had taken on ballast from the room's silence.",
        "She felt the ledger through her coat: salt-stiff, patient, and full of names that leaned toward the lantern light.",
      ],
      Condense: ["The ledger seemed to pull the room toward its salt-stiff spine.", "Every impossible ship in the ledger felt suddenly present."],
      "Dialogue polish": [
        'Jonas said, "Bad tide. Bad men. Don\'t make me dress it up, Mar."',
        '"I owe them," Jonas said. "Not the way they tell it. Worse."',
      ],
      "Add a sensory anchor": ["The bell rope smelled faintly of wet hemp and old smoke.", "Salt prickled on Mara's lip whenever the pub door opened."],
    };
    if (variants[tool]) return { ...base, body: "", variants: variants[tool] };
    if (tool === "Describe")
      return {
        ...base,
        kind: "describe",
        body: "",
        groups: {
          Sight: "Brass gone green at the seams; lantern glass clouded by old smoke.",
          Sound: "Rain ticking at the pub windows; the drowned bell humming when the door shuts.",
          Smell: "Paraffin, salt, ale foam, and wool drying too close to the hearth.",
          Taste: "Tea gone tannic and metallic, like a coin held under the tongue.",
          Touch: "Ledger pages stiff as dried kelp beneath Mara's thumb.",
          Metaphor: "The room held its breath like a bell under water.",
        },
      };
    if (tool === "Brainstorm")
      return {
        ...base,
        body: "1. Agnes hid the original passenger list in a hymnal.\n2. The Brass Key opens a drawer that was sealed after the Night Ferry.\n3. Elias's father paid Jonas's debt to buy silence.\n4. The Guild uses ghost ships as coded witness names.\n5. Thomas drowned while moving proof, not by accident.\n6. Mara maps currents to decode the ledger.\n7. Jonas knows one witness is still alive.\n8. The Lamp Oath requires a public signal.",
      };
    if (tool === "Summarize")
      return {
        ...base,
        kind: "summarize",
        body: "At the Drowned Bell, Mara learns Thomas's ledger may be a witness list, sees the Harbor Guild pressure Jonas, and lets Elias into the mystery despite old hurt.",
      };
    if (tool === "Name generator") return { ...base, body: "Soren Pike\nLina Voss\nCalder Brine\nNessa Wren\nOrrin Vale\nMaeve Thorne\nIvar Kelp\nElian Rusk" };
    if (tool === "Feedback" || tool === "Chapter feedback")
      return {
        ...base,
        tool: "Chapter feedback",
        body: "What works: pub warmth gives the mystery human pressure.\nPacing: let Agnes's warning breathe before the Guild enters.\nClarity: define the two-finger Guild gesture once.\nCharacter: Mara is strongest when she notices instead of explains.\nContinuity: keep the Night Ferry clue tied to Thomas's exact handwriting.",
      };
    return { ...base, body: DATA.aiOutputs.Continue };
  }

  /* ---------- AI runs and insertion ---------- */
  const REPLACE_TOOLS = new Set(["Rewrite", "Expand", "Condense", "Dialogue polish"]);
  function ensureWrite() {
    if (S().screen === "write") return false;
    S().screen = "write";
    W.App.save();
    W.App.render();
    return true;
  }
  function runAI(tool, preset) {
    const from = D.activeElement;
    ensureWrite();
    flush();
    if (tool === "Draft from beats") return openDraft(active().id);
    const m = toolModel(tool),
      cost = modelCost(m);
    if (typeof cost === "number" && settingsOf().hostedCredits === false)
      return UI.toast("Hosted credits are off · pick your key or a local model in the AI panel, or turn them on in Settings");
    const card = buildCard(tool);
    if (preset && preset !== card.tool) card.preset = preset;
    card.model = m.replace(/\s*\$+$/, "").replace(/\s*\(free\)$/, "");
    card.credits = typeof cost === "number" ? String(cost) : cost;
    card.time = hhmm();
    card.id = newId("ai");
    if (typeof cost === "number") S().credits = Math.max(0, Math.round(((S().credits ?? 1240) - cost) * 10) / 10);
    S().aiCards = [card, ...(S().aiCards || [])].slice(0, 20);
    S().rightTab = "AI";
    W.App.save();
    showRight();
    const hist = D.getElementById("aiHistory");
    if (hist && D.getElementById("rtab-AI")?.getAttribute("aria-selected") === "true") {
      hist.querySelector(".ai-empty")?.remove();
      hist.insertAdjacentHTML("afterbegin", cardHTML(card));
      while (hist.children.length > 20) hist.lastElementChild.remove();
      const cr = D.getElementById("aiCredits");
      if (cr) cr.textContent = creditsText();
    } else refreshRight();
    const el = D.querySelector(`.ai-card[data-card-id="${card.id}"]`);
    if (!el) return;
    el.scrollIntoView({ block: "nearest" });
    W.Write.stream(el, (stopped) => {
      if (stopped) trimCard(card, el);
      UI.toast(stopped ? "Stopped · kept what was written" : `${card.tool}${card.preset ? ` · ${card.preset}` : ""} ready`);
    });
    // Retrying the oldest card trims it from the history (and a screen switch replaces the trigger); land on the new card.
    if (from !== D.body && D.activeElement === D.body) (el.querySelector("[data-stop-stream]") || el.querySelector(".ai-actions button"))?.focus();
  }
  // A stopped stream keeps only the visible partial text, so Insert/Copy match what the writer saw.
  function trimCard(card, el) {
    const txt = (n) => (n?.textContent || "").trim();
    if (card.variants) card.variants = [...el.querySelectorAll(":scope > blockquote")].map(txt).filter(Boolean);
    if (card.groups) {
      const hs = [...el.querySelectorAll(":scope > h4")];
      Object.keys(card.groups).forEach((k, i) => {
        const v = txt(hs[i]?.nextElementSibling);
        if (v) card.groups[k] = v;
        else delete card.groups[k];
      });
    }
    if (card.body) {
      const list = el.querySelector(":scope > .ai-list");
      card.body = list
        ? [...list.children]
            .map(txt)
            .filter(Boolean)
            .map((t, i) => (list.tagName === "OL" ? `${i + 1}. ${t}` : t))
            .join("\n")
        : txt(el.querySelector(":scope > p"));
    }
    W.App.save();
    el.insertAdjacentHTML("afterend", cardHTML(card));
    const fresh = el.nextElementSibling;
    el.remove();
    fresh?.querySelector(".ai-actions button")?.focus();
  }
  function aiSpan(t) {
    const s = D.createElement("span");
    s.className = "ai-made";
    s.title = "AI-generated · edit to make it yours";
    s.textContent = t;
    return s;
  }
  function caretToEnd(el, node) {
    const end = offsetIn(el, node, node.childNodes.length);
    syncProse(el);
    refreshProse(el);
    el.focus();
    setSel(el, { a: end, as: false, f: end, fs: false });
    W.Write._lastPos = posOf(el);
  }
  function insertAI(text, o = {}) {
    text = String(text || "").trim();
    if (!text) return;
    flush();
    const paras = text.split(/\n{2,}/).map((t) => t.trim()).filter(Boolean);
    let pos = W.Write._lastPos,
      el = pos && proseByKey(pos.key);
    if (!el || el.hidden || (o.cid && !pos.key.startsWith(o.cid + ":"))) (el = null), (pos = null);
    if (o.replace && el && pos.a !== pos.f) {
      const r = rangeFrom(el, pos),
        p0 = paraAt(r.startContainer);
      if (p0 && !p0.contains(r.endContainer)) r.setEnd(p0, p0.childNodes.length);
      r.deleteContents();
      const node = aiSpan(paras.join(" "));
      r.insertNode(node);
      setEmpty(el);
      caretToEnd(el, node);
      return UI.toast("Replaced · AI text is tinted until you edit it");
    }
    let ref = null;
    if (el) ref = [...el.querySelectorAll("p")][pos.pi] || [...el.querySelectorAll("p")].pop();
    else {
      const cid = o.cid || active().id;
      el = [...D.querySelectorAll(`.prose[data-scene^="${cid}:"]`)].filter((x) => !x.hidden).pop();
      if (!el) {
        if (o._retry) return UI.toast("Couldn't find a place to insert");
        const c = S().chapters.find((x) => x.id === cid);
        S().activeChapter = cid;
        S().activeScene = c?.scenes?.[c.scenes.length - 1]?.id || null;
        const f = S().foldedScenes || {};
        Object.keys(f).forEach((k) => k.startsWith(cid + ":") && delete f[k]);
        W.App.save();
        W.App.render();
        return insertAI(text, { ...o, _retry: true });
      }
      ref = [...el.querySelectorAll("p")].pop();
    }
    const nodes = paras.map((t) => {
      const p = D.createElement("p");
      p.append(aiSpan(t));
      return p;
    });
    const blank = ref && !ref.textContent.trim();
    if (ref) ref.after(...nodes);
    else el.append(...nodes);
    if (blank) ref.remove();
    setEmpty(el);
    caretToEnd(el, nodes[nodes.length - 1].firstChild);
    UI.toast("Inserted · AI text is tinted until you edit it");
  }

  /* ---------- Draft from beats ---------- */
  function openDraft(cid, beatIdx) {
    ensureWrite();
    flush();
    const c = S().chapters.find((x) => x.id === cid) || active(),
      m = D.getElementById("draftModal"),
      body = D.getElementById("draftBody");
    if (!m || !body) return;
    const beat = beatIdx != null && beatIdx !== "" ? c.beats?.[+beatIdx]?.[0] : null,
      written = (c.scenes || []).some((sc) => hasText(sc.prose)),
      text = DATA.aiOutputs.Draft;
    W.Write._draft = { cid: c.id, text };
    body.dataset.ch = c.id;
    body.innerHTML = `<p class="muted">Chapter ${c.n} · ${UI.esc(c.title)} · from ${beat ? `beat “${UI.esc(beat)}”` : `${(c.beats || []).length} planned beats`} · ${UI.esc(curModel().replace(/\s*\$+$/, ""))}</p><div class="draft-preview">${text
      .split(/\n{2,}/)
      .map((p) => `<p>${UI.esc(p)}</p>`)
      .join("")}</div><div class="modal-actions">${
      written
        ? `<button class="pill-btn active" data-draft="cursor" data-autofocus>Insert at cursor</button> <button class="small-btn" data-draft="replace">Replace chapter text</button> <button class="small-btn" data-draft="scene">Add as new scene</button>`
        : `<button class="pill-btn active" data-draft="scene" data-autofocus>Start chapter with this draft</button>`
    }</div>`;
    m.classList.add("open");
  }
  function applyDraft(mode) {
    const d = W.Write._draft,
      c = d && S().chapters.find((x) => x.id === d.cid);
    D.getElementById("draftModal")?.classList.remove("open");
    if (!c) return;
    if (mode === "cursor") return insertAI(d.text, { cid: c.id });
    flush();
    const prose = d.text
      .split(/\n{2,}/)
      .map((t) => AI_OPEN + enc(t.trim()) + "</span>")
      .join("\n\n");
    const before = snapWords(c.scenes),
      wasEmpty = !(c.scenes || []).some((sc) => hasText(sc.prose));
    if (mode === "replace") {
      takeSnapshot(c, "Before AI draft");
      const first = c.scenes?.[0];
      c.scenes = [{ id: first?.id || c.id + "s1", title: first?.title || "Scene 1", pov: first?.pov || c.pov, prose }];
    } else {
      c.scenes = (c.scenes || []).filter((sc) => hasText(sc.prose));
      c.scenes.push({ id: newId(c.id + "s"), title: c.scenes.length ? "Drafted scene" : c.title, pov: c.pov, prose });
    }
    applyDelta(c, snapWords(c.scenes) - before);
    const sc = c.scenes[c.scenes.length - 1];
    S().activeChapter = c.id;
    S().activeScene = sc.id;
    W.App.save();
    W.App.render();
    W.Write.scrollToChapter(c.id, sc.id);
    const el = proseByKey(`${c.id}:${sc.id}`);
    if (el) {
      el.focus();
      const end = el.textContent.length;
      setSel(el, { a: end, as: false, f: end, fs: false });
    }
    UI.toast(mode === "replace" ? "Chapter replaced with draft · old text saved as a snapshot" : wasEmpty ? `Chapter ${c.n} started from the draft · AI text is tinted until you edit it` : "Draft added as a new scene");
  }

  /* ---------- Snapshots ---------- */
  const snapWords = (scenes) => (scenes || []).reduce((n, sc) => n + proseWords(sc.prose), 0);
  const snapText = (scenes) => (scenes || []).map((sc) => plainParas(sc.prose).join("\n\n")).join("\n\n");
  function snaps(c) {
    const all = (S().snapshots = S().snapshots || {});
    if (!all[c.id]) {
      const base = clone(DATA.chapters.find((x) => x.id === c.id)?.scenes || []),
        older = clone(base),
        last = older[older.length - 1];
      if (last) last.prose = paragraphs(last.prose).slice(0, -1).join("\n\n");
      all[c.id] = base.length
        ? [
            { id: newId("sn"), label: "Today 10:42", scenes: base },
            { id: newId("sn"), label: "Yesterday 22:10", scenes: older },
          ]
        : [];
    }
    return all[c.id];
  }
  function takeSnapshot(c, label) {
    flush();
    const list = snaps(c);
    list.unshift({ id: newId("sn"), label: `${label} · ${hhmm()}`, scenes: clone(c.scenes || []) });
    list.length = Math.min(list.length, 12);
    W.App.save();
  }
  function renderSnaps(diffId) {
    const c = active(),
      list = snaps(c),
      body = D.getElementById("snapBody");
    if (!body) return;
    const s = diffId && list.find((x) => x.id === diffId);
    body.innerHTML = `<p class="muted">Chapter ${c.n} · ${UI.esc(c.title)} · now ${snapWords(c.scenes).toLocaleString()} words</p><button class="pill-btn active" data-snap-take data-autofocus>Take snapshot</button><ul class="snap-list">${
      list
        .map(
          (x) =>
            `<li class="snap-row"><span><b>${UI.esc(x.label)}</b> <small>${snapWords(x.scenes).toLocaleString()} words</small></span><span><button class="small-btn" data-snap-diff="${x.id}" aria-pressed="${x.id === diffId}">Compare</button> <button class="small-btn" data-snap-restore="${x.id}">Restore</button></span></li>`,
        )
        .join("") || `<li class="muted">No snapshots yet.</li>`
    }</ul><div id="snapDiff" aria-live="polite">${s ? `<h3>${UI.esc(s.label)} → now</h3>${diffHTML(snapText(s.scenes), snapText(c.scenes))}` : ""}</div>`;
  }
  function openSnapshots() {
    ensureWrite();
    flush();
    renderSnaps();
    D.getElementById("snapshotModal")?.classList.add("open");
  }
  function restoreSnap(id) {
    const c = active(),
      s = snaps(c).find((x) => x.id === id);
    if (!s) return;
    takeSnapshot(c, "Before restore");
    const before = snapWords(c.scenes);
    c.scenes = clone(s.scenes);
    applyDelta(c, snapWords(c.scenes) - before);
    W.App.save();
    D.getElementById("snapshotModal")?.classList.remove("open");
    W.App.render();
    D.querySelector('[data-menu-toggle="tools-menu"]')?.focus();
    UI.toast(`Restored “${s.label}” · the text you replaced is saved as a snapshot`);
  }
  const diffTokens = (t) => String(t).replace(/\n{2,}/g, " ¶ ").split(/\s+/).filter(Boolean);
  function diffHTML(a, b) {
    const A = diffTokens(a),
      B = diffTokens(b);
    let p = 0,
      s = 0;
    while (p < A.length && p < B.length && A[p] === B[p]) p++;
    while (s < A.length - p && s < B.length - p && A[A.length - 1 - s] === B[B.length - 1 - s]) s++;
    const a2 = A.slice(p, A.length - s),
      b2 = B.slice(p, B.length - s),
      n = a2.length,
      m = b2.length,
      ops = A.slice(0, p).map((t) => ["=", t]);
    if (n * m > 250000) ops.push(...a2.map((t) => ["-", t]), ...b2.map((t) => ["+", t]));
    else {
      const T = new Uint16Array((n + 1) * (m + 1)),
        at = (i, j) => i * (m + 1) + j;
      for (let i = n - 1; i >= 0; i--)
        for (let j = m - 1; j >= 0; j--) T[at(i, j)] = a2[i] === b2[j] ? T[at(i + 1, j + 1)] + 1 : Math.max(T[at(i + 1, j)], T[at(i, j + 1)]);
      let i = 0,
        j = 0;
      while (i < n && j < m) {
        if (a2[i] === b2[j]) ops.push(["=", a2[i++]]), j++;
        else if (T[at(i + 1, j)] >= T[at(i, j + 1)]) ops.push(["-", a2[i++]]);
        else ops.push(["+", b2[j++]]);
      }
      while (i < n) ops.push(["-", a2[i++]]);
      while (j < m) ops.push(["+", b2[j++]]);
    }
    ops.push(...A.slice(A.length - s).map((t) => ["=", t]));
    let add = 0,
      del = 0;
    const runs = [];
    ops.forEach(([k, t]) => {
      if (t !== "¶") k === "+" ? add++ : k === "-" ? del++ : 0;
      const last = runs[runs.length - 1];
      if (last && last.k === k) last.t.push(t);
      else runs.push({ k, t: [t] });
    });
    const tok = (t) => (t === "¶" ? `<span class="pil" aria-label="paragraph break">¶</span><br>` : UI.esc(t));
    const html = runs
      .map(({ k, t }) => {
        if (k === "=") return t.length > 24 ? `${t.slice(0, 8).map(tok).join(" ")} <span class="muted">…</span> ${t.slice(-8).map(tok).join(" ")}` : t.map(tok).join(" ");
        return k === "+" ? `<ins>${t.map(tok).join(" ")}</ins>` : `<del>${t.map(tok).join(" ")}</del>`;
      })
      .join(" ");
    return `<p class="diff-stats"><span class="add">+${add}</span> <span class="del">−${del}</span> words since this snapshot</p><div class="diff">${add || del ? html : `<p class="muted">No differences.</p>`}</div>`;
  }

  /* ---------- Find & replace (whole manuscript) ---------- */
  function openFind() {
    ensureWrite();
    flush();
    D.getElementById("findModal")?.classList.add("open");
    runFind();
  }
  function findMatches() {
    const q = D.getElementById("findQ")?.value || "";
    if (!q) return [];
    const e = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      re = new RegExp(D.getElementById("findWord")?.checked ? `(?<![\\p{L}\\p{N}_])${e}(?![\\p{L}\\p{N}_])` : e, D.getElementById("findCase")?.checked ? "gu" : "giu"),
      out = [];
    sorted().forEach((c) =>
      (c.scenes || []).forEach((sc) => {
        let base = 0;
        paragraphs(sc.prose).forEach((p, pi) => {
          const plain = plainPara(p);
          let off = 0,
            poff = 0;
          tokens(block(p).body).forEach((t, ti) => {
            if (t.text == null) return;
            const txt = decode(t.text);
            re.lastIndex = 0;
            let m;
            while ((m = re.exec(txt))) {
              const at = poff + m.index;
              out.push({
                c,
                sc,
                pi,
                ti,
                idx: m.index,
                len: m[0].length,
                off: base + off + txt.slice(0, m.index).replace(/\n/g, "").length,
                pre: (at > 40 ? "…" : "") + plain.slice(Math.max(0, at - 40), at),
                hit: m[0],
                post: plain.slice(at + m[0].length, at + m[0].length + 40) + (plain.length > at + m[0].length + 40 ? "…" : ""),
              });
            }
            off += txt.replace(/\n/g, "").length;
            poff += txt.length;
          });
          base += plain.replace(/\n/g, "").length;
        });
      }),
    );
    return out;
  }
  function runFind() {
    const q = D.getElementById("findQ")?.value || "",
      ms = (W.Write._matches = findMatches()),
      cnt = D.getElementById("findCount"),
      ra = D.querySelector("[data-replace-all]"),
      ul = D.getElementById("findResults");
    if (cnt) cnt.textContent = q ? `${ms.length} match${ms.length === 1 ? "" : "es"} in the manuscript${ms.length > 100 ? " · showing the first 100" : ""}` : "Type to search every chapter.";
    if (ra) ra.disabled = !ms.length;
    if (ul)
      ul.innerHTML = ms
        .slice(0, 100)
        .map(
          (m, i) =>
            `<li><button class="find-go" data-find-go="${i}"><small>Ch ${m.c.n} · ${UI.esc(m.sc.title || "")}</small><span>${UI.esc(m.pre)}<mark>${UI.esc(m.hit)}</mark>${UI.esc(m.post)}</span></button><button class="small-btn" data-replace-one="${i}" aria-label="Replace match ${i + 1}">Replace</button></li>`,
        )
        .join("");
  }
  function applyReplace(list) {
    const rep = D.getElementById("replaceQ")?.value ?? "",
      byScene = new Map();
    list.forEach((m) => {
      if (!byScene.has(m.sc)) byScene.set(m.sc, { c: m.c, ms: [] });
      byScene.get(m.sc).ms.push(m);
    });
    const touched = new Set();
    byScene.forEach(({ c, ms }, sc) => {
      const ps = paragraphs(sc.prose);
      ms.sort((a, b) => b.pi - a.pi || b.ti - a.ti || b.idx - a.idx).forEach((m) => {
        const { cls, body } = block(ps[m.pi]),
          toks = tokens(body),
          txt = decode(toks[m.ti].text);
        toks[m.ti].text = enc(txt.slice(0, m.idx) + rep + txt.slice(m.idx + m.len));
        ps[m.pi] = wrapBlock(cls, toks.map((x) => x.text ?? x.tag).join(""));
      });
      const prose = ps.join("\n\n");
      applyDelta(c, proseWords(prose) - proseWords(sc.prose));
      sc.prose = prose;
      touched.add(c);
      refreshProse(proseByKey(`${c.id}:${sc.id}`));
    });
    W.App.save();
    touched.forEach((c) => updateCounts(c));
    return touched;
  }
  function findGo(i) {
    const m = W.Write._matches?.[i];
    if (!m) return;
    D.getElementById("findModal")?.classList.remove("open");
    const key = `${m.c.id}:${m.sc.id}`;
    let el = proseByKey(key);
    if (!el || el.hidden) {
      S().activeChapter = m.c.id;
      S().activeScene = m.sc.id;
      delete (S().foldedScenes || {})[key];
      W.App.save();
      W.App.render();
      el = proseByKey(key);
    }
    if (!el) return;
    el.focus();
    setSel(el, { a: m.off, as: true, f: m.off + m.len, fs: false });
    const r = getSelection().getRangeAt(0).getBoundingClientRect(),
      ps = D.querySelector(".page-scroll");
    if (ps) ps.scrollTop += r.top - ps.getBoundingClientRect().top - ps.clientHeight / 2;
    W.Write._lastPos = posOf(el);
  }

  /* ---------- Read aloud & read-through ---------- */
  function syncReadBtn() {
    D.querySelectorAll("[data-read-aloud]").forEach((b) => (b.textContent = W.Write._speaking ? "Stop reading aloud" : "Read aloud"));
  }
  function stopSpeech() {
    W.Write._speakId = (W.Write._speakId || 0) + 1;
    if (!W.Write._speaking) return false;
    W.speechSynthesis?.cancel();
    W.Write._speaking = false;
    syncReadBtn();
    return true;
  }
  function readAloud() {
    if (stopSpeech()) return UI.toast("Stopped reading");
    if (!W.speechSynthesis) return UI.toast("Read aloud isn't supported in this browser");
    flush();
    const all = [...D.querySelectorAll(".prose[data-scene]:not([hidden])")],
      pos = W.Write._lastPos;
    let el = pos && proseByKey(pos.key),
      start = pos?.pi > 0 ? pos.pi : 0;
    if (!el || el.hidden) (el = all[0]), (start = 0);
    if (!el) return;
    const texts = all
      .slice(all.indexOf(el))
      .flatMap((x, k) => [...x.querySelectorAll("p")].slice(k ? 0 : start))
      .map((p) => p.textContent.trim())
      .filter(Boolean);
    if (!texts.length) return UI.toast("Nothing to read here yet");
    speechSynthesis.cancel();
    const id = (W.Write._speakId = (W.Write._speakId || 0) + 1);
    W.Write._speaking = true;
    syncReadBtn();
    const rate = +settingsOf().ttsRate || 1,
      voice = settingsOf().ttsVoice && speechSynthesis.getVoices().find((v) => v.name === settingsOf().ttsVoice);
    texts.forEach((t, i) => {
      const u = new SpeechSynthesisUtterance(t);
      u.rate = rate;
      if (voice) u.voice = voice;
      if (i === texts.length - 1)
        u.onend = u.onerror = () => {
          if (W.Write._speakId !== id) return;
          W.Write._speaking = false;
          syncReadBtn();
        };
      speechSynthesis.speak(u);
    });
    UI.toast("Reading aloud from the cursor · Esc stops");
  }
  function openReadThrough() {
    ensureWrite();
    flush();
    const o = D.getElementById("readOverlay"),
      book = D.getElementById("readBook");
    if (!o || !book) return;
    book.innerHTML = `<h1>${UI.esc(DATA.book?.title || "The Salt Ledger")}</h1>${sorted()
      .map(
        (c) =>
          `<h2 id="rt-${c.id}">Chapter ${c.n} · ${UI.esc(c.title)}</h2>${
            (c.scenes || [])
              .filter((sc) => hasText(sc.prose))
              .map((sc, i) => (i ? `<p class="rt-break" aria-hidden="true">✦</p>` : "") + proseHTML(sc.prose, "read"))
              .join("") || `<p class="muted"><i>Not yet written.</i></p>`
          }`,
      )
      .join("")}`;
    o.classList.add("open");
    requestAnimationFrame(() => {
      const h = D.getElementById("rt-" + active().id);
      if (h) o.scrollTop += h.getBoundingClientRect().top - o.getBoundingClientRect().top - 24;
    });
  }
  /* ---------- Overlays ---------- */
  const FM_PRESETS = ["Rewrite", "Rephrase", "More vivid", "Show, don't tell", "More tension", "Shorter"];
  function overlays() {
    return `<div id="floatMenu" class="floating-menu" role="toolbar" aria-label="Selection tools"><div class="fm-group"><button class="small-btn" data-fm-more aria-haspopup="menu" aria-expanded="false">Rewrite ▾</button><div class="fm-sub" role="menu">${FM_PRESETS.map((p) => `<button role="menuitem" data-ai="Rewrite" data-preset="${p}">${p}</button>`).join("")}<button role="menuitem" data-custom-tool>Custom…</button></div></div><button class="small-btn" data-ai="Describe">Describe</button><button class="small-btn" data-ai="Expand">Expand</button><button class="small-btn" data-ai="Condense">Condense</button><button class="small-btn" data-ai="Dialogue polish">Dialogue polish</button><span class="fm-sep" aria-hidden="true"></span><button class="small-btn" data-add-comment>Comment</button></div>
    <div id="contextMenu" class="context-menu" role="menu" aria-label="Selection actions"><button role="menuitem" class="small-btn" data-ai="Rewrite">Rewrite</button><button role="menuitem" class="small-btn" data-ai="Rewrite" data-preset="More tension">More tension</button><button role="menuitem" class="small-btn" data-ai="Rewrite" data-preset="Shorter">Shorter</button><button role="menuitem" class="small-btn" data-ai="Dialogue polish">Dialogue polish</button><button role="menuitem" class="small-btn" data-ai="Describe">Describe</button><button role="menuitem" class="small-btn" data-add-comment>Comment</button></div>
    <div id="hoverPop" class="popover" role="dialog" aria-label="Details"></div>
    <div id="slashMenu" class="popover slash-menu" role="listbox" aria-label="Slash commands"></div>
    ${UI.modal(
      "findModal",
      "Find & replace",
      `<div class="grid cols find-grid"><label class="field">Find<input id="findQ" type="search" data-autofocus placeholder="e.g. ledger" autocomplete="off"></label><label class="field">Replace with<input id="replaceQ" placeholder="e.g. logbook" autocomplete="off"></label></div><div class="find-opts"><label class="check"><input type="checkbox" id="findCase"> Match case</label><label class="check"><input type="checkbox" id="findWord"> Whole word</label><span class="spacer"></span><button class="pill-btn active" data-replace-all disabled>Replace all</button></div><p id="findCount" class="muted" role="status"></p><ul id="findResults" class="find-results"></ul>`,
    )}
    ${UI.modal("snapshotModal", "Snapshots", `<div id="snapBody"></div>`)}
    ${UI.modal("draftModal", "Draft from beats", `<div id="draftBody"></div>`)}
    <div id="readOverlay" class="read-overlay" role="dialog" aria-modal="true" aria-label="Read-through"><button class="small-btn close" data-close>Close</button><article class="read-book" id="readBook" tabindex="-1" data-autofocus></article></div>`;
  }
  function closeMenus() {
    ["floatMenu", "contextMenu"].forEach((id) => D.getElementById(id)?.classList.remove("open"));
    D.querySelector("#floatMenu .fm-sub")?.classList.remove("open");
    D.querySelector("[data-fm-more]")?.setAttribute("aria-expanded", "false");
  }

  /* ---------- Hover cards: mentions, grammar, comments ---------- */
  const unwrap = (n) => n.replaceWith(...n.childNodes);
  function placePop(p, r) {
    const h = p.offsetHeight;
    p.style.left = Math.max(8, Math.min(innerWidth - p.offsetWidth - 8, r.left)) + "px";
    p.style.top = (r.bottom + 8 + h > innerHeight - 8 && r.top - 8 - h >= 8 ? r.top - 8 - h : r.bottom + 8) + "px";
  }
  function showPop(m, kind) {
    const p = D.getElementById("hoverPop");
    if (!p || !m?.isConnected) return;
    clearTimeout(W.Write._popTimer);
    let html, label;
    if (kind === "edit") {
      label = "New comment";
      html = `<b>New comment</b><div class="field reply-row"><textarea data-comment-text aria-label="Comment" rows="3" placeholder="Note to self…"></textarea>${micBtn("comment", "comment")}</div><div class="pop-actions"><button class="small-btn" data-comment-cancel>Cancel</button><button class="pill-btn active" data-comment-save>Save <small>Ctrl+Enter</small></button></div>`;
    } else if (m.classList.contains("mention")) {
      const e = codexAll().find((x) => x.id === m.dataset.codex);
      if (!e) return;
      label = e.name;
      html = `<div class="pop-head"><span class="portrait mini" style="background:${UI.esc(e.color || "#6B7FA6")}" aria-hidden="true">${UI.esc(UI.initials(e.name))}</span><span><b>${UI.esc(UI.cap(e.name))}</b><br><small>${UI.esc(UI.singular(e.type))} · AI context: ${UI.esc(e.context || "When mentioned")}</small></span></div><dl class="pop-fields">${Object.entries(e.fields || {})
        .slice(0, 3)
        .map(([k, v]) => `<dt>${UI.esc(UI.cap(k))}</dt><dd>${UI.esc(v)}</dd>`)
        .join("")}</dl><button class="small-btn" data-open-codex="${e.id}">Open in Codex</button>`;
    } else if (m.classList.contains("grammar")) {
      label = "Grammar suggestion";
      html = `<b>Harper · on-device</b><p>Did you mean “${UI.esc(m.dataset.fix)}”? “Their” shows ownership; “there are” introduces something.</p><div class="pop-actions"><button class="pill-btn active" data-grammar-fix>Change to “${UI.esc(m.dataset.fix)}”</button><button class="small-btn" data-pop-dismiss>Ignore</button></div>`;
    } else {
      label = "Comment";
      const [note, ...replies] = String(m.dataset.comment || "").split(" ↳ ");
      html = `<b>Comment</b><p>${UI.esc(note)}</p>${replies.map((r) => `<p class="reply">↳ ${UI.esc(r)}</p>`).join("")}<div class="field reply-row"><input data-comment-reply aria-label="Reply" placeholder="Reply… (Enter to add)">${micBtn("comment", "reply")}</div><div class="pop-actions"><button class="small-btn" data-comment-resolve>Resolve</button></div>`;
    }
    p.innerHTML = html;
    p.setAttribute("aria-label", label);
    p.dataset.kind = kind || "";
    W.Write._popFor = m;
    p.classList.add("open");
    placePop(p, m.getBoundingClientRect());
    if (kind === "edit") p.querySelector("textarea")?.focus();
  }
  function hidePop() {
    const p = D.getElementById("hoverPop");
    if (!p?.classList.contains("open")) return false;
    const had = p.contains(D.activeElement);
    p.classList.remove("open");
    W.Write._popFor = null;
    return had ? "focus" : true;
  }
  function backToProse(el) {
    el = el?.isConnected ? el : proseByKey(W.Write._lastPos?.key);
    if (!el) return;
    el.focus();
    if (W.Write._lastPos?.key === el.dataset.scene) setSel(el, W.Write._lastPos);
  }
  function addComment() {
    const pos = W.Write._lastPos,
      el = pos && proseByKey(pos.key);
    closeMenus();
    if (!el || el.hidden || pos.a === pos.f) return UI.toast("Select some text to comment on");
    const r = rangeFrom(el, pos),
      p0 = paraAt(r.startContainer);
    if (p0 && !p0.contains(r.endContainer)) r.setEnd(p0, p0.childNodes.length);
    const mark = D.createElement("mark");
    mark.className = "comment-mark pending";
    mark.dataset.comment = "";
    mark.append(r.extractContents());
    r.insertNode(mark);
    W.Write._pendingMark = mark;
    showPop(mark, "edit");
  }
  function saveComment() {
    const mark = W.Write._pendingMark,
      t = D.querySelector("#hoverPop [data-comment-text]")?.value.trim();
    if (!mark) return;
    if (!t) return UI.toast("Type a comment first");
    mark.dataset.comment = t;
    mark.classList.remove("pending");
    W.Write._pendingMark = null;
    hidePop();
    const el = proseOf(mark);
    syncProse(el);
    refreshProse(el);
    backToProse(el);
    UI.toast("Comment added");
  }
  function cancelComment() {
    const mark = W.Write._pendingMark;
    W.Write._pendingMark = null;
    hidePop();
    if (!mark?.isConnected) return;
    const el = proseOf(mark);
    unwrap(mark);
    el?.normalize();
    backToProse(el);
  }
  function replyComment(input) {
    const m = W.Write._popFor,
      t = input.value.trim();
    if (!m?.isConnected || !t) return;
    m.dataset.comment = `${m.dataset.comment} ↳ ${t}`;
    syncProse(proseOf(m));
    showPop(m, "comment");
    D.querySelector("#hoverPop [data-comment-reply]")?.focus();
  }
  function resolveComment() {
    const m = W.Write._popFor;
    hidePop();
    if (!m?.isConnected) return;
    const el = proseOf(m);
    unwrap(m);
    syncProse(el);
    refreshProse(el);
    backToProse(el);
    UI.toast("Comment resolved");
  }
  function fixGrammar() {
    const m = W.Write._popFor;
    hidePop();
    if (!m?.isConnected) return;
    const el = proseOf(m),
      t = D.createTextNode(m.dataset.fix);
    m.replaceWith(t);
    const at = offsetIn(el, t, t.length);
    syncProse(el);
    refreshProse(el);
    el.focus();
    setSel(el, { a: at, as: false, f: at, fs: false });
    W.Write._lastPos = posOf(el);
    UI.toast("Fixed");
  }
  function ignoreGrammar() {
    const m = W.Write._popFor,
      had = hidePop() === "focus";
    if (!m?.isConnected || !m.classList.contains("grammar")) return had && backToProse();
    const el = proseOf(m),
      p = paraAt(m),
      r = D.createRange();
    r.setStartBefore(m);
    r.setEnd(p, p.childNodes.length);
    const key = ignoreKey(r.toString()),
      list = (S().ignoredChecks = S().ignoredChecks || []);
    if (!list.includes(key)) list.push(key);
    if (list.length > 200) list.shift();
    W.App.save();
    refreshProse(el, !had && D.activeElement === el);
    if (had) backToProse(el);
    UI.toast(`Ignored · “${key}…” won't be flagged again`);
  }

  /* ---------- Slash commands ---------- */
  const SLASH = [
    ["continue", "Continue writing", () => runAI("Continue")],
    ["describe", "Describe the moment", () => runAI("Describe")],
    ["brainstorm", "Brainstorm ideas", () => runAI("Brainstorm")],
    ["scene-break", "Start a new scene here", () => splitScene()],
    ["dictate", "Dictate at the cursor", () => D.querySelector(".editor-toolbar [data-dictate]")?.click()],
    ["draft", "Draft from beats", () => openDraft(active().id)],
  ];
  function slashCheck(el) {
    const sel = getSelection(),
      p = sel.rangeCount && sel.isCollapsed ? paraAt(sel.anchorNode) : null,
      m = p && el.contains(p) && /^\/([a-z-]*)$/.exec(p.textContent),
      items = m ? SLASH.filter(([k]) => k.startsWith(m[1])) : [];
    if (!items.length) return slashClose();
    W.Write._slash = { el, p, items, i: 0 };
    slashRender();
  }
  function slashRender() {
    const s = W.Write._slash,
      menu = D.getElementById("slashMenu");
    if (!s || !menu) return;
    menu.innerHTML = s.items
      .map(([k, label], i) => `<button role="option" id="slash-${k}" data-slash="${k}" aria-selected="${i === s.i}" class="${i === s.i ? "active" : ""}" tabindex="-1"><b>/${k}</b> <small>${label}</small></button>`)
      .join("");
    menu.classList.add("open");
    s.el.setAttribute("aria-activedescendant", "slash-" + s.items[s.i][0]);
    slashPlace();
  }
  function slashPlace() {
    const s = W.Write._slash,
      menu = D.getElementById("slashMenu");
    if (!s || !menu?.classList.contains("open") || !s.p.isConnected) return;
    const r = s.p.getBoundingClientRect(),
      h = menu.offsetHeight;
    menu.style.left = Math.max(8, Math.min(innerWidth - menu.offsetWidth - 8, r.left)) + "px";
    menu.style.top = (r.bottom + 4 + h > innerHeight - 8 ? Math.max(8, r.top - 4 - h) : r.bottom + 4) + "px";
  }
  function slashClose() {
    const s = W.Write._slash;
    W.Write._slash = null;
    D.getElementById("slashMenu")?.classList.remove("open");
    s?.el.removeAttribute("aria-activedescendant");
  }
  function slashRun(k) {
    const s = W.Write._slash,
      cmd = SLASH.find((x) => x[0] === k);
    slashClose();
    if (!s || !cmd || !s.p.isConnected) return;
    s.p.innerHTML = "<br>";
    s.el.focus();
    const r = D.createRange();
    r.setStart(s.p, 0);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    W.Write._lastPos = posOf(s.el);
    syncProse(s.el);
    setEmpty(s.el);
    cmd[2]();
  }

  /* ---------- Structure & formatting ---------- */
  function splitScene() {
    flush();
    const pos = W.Write._lastPos,
      el = pos && proseByKey(pos.key),
      { c, sc } = el ? sceneOf(el.dataset.scene) : {};
    if (!el || !sc) return UI.toast("Write something first, then put the cursor where the new scene starts");
    const at = Math.min(pos.a, pos.f);
    if (at === 0) return UI.toast("Move the cursor past the start of the scene to split it");
    const before = proseWords(sc.prose),
      r = D.createRange();
    r.setStart(...pointAt(el, at, true));
    r.setEnd(el, el.childNodes.length);
    const tmp = D.createElement("div");
    tmp.append(r.extractContents());
    const nu = { id: newId(c.id + "s"), title: "New scene", pov: sc.pov || c.pov, prose: serialize(tmp) };
    sc.prose = serialize(el);
    c.scenes.splice(c.scenes.indexOf(sc) + 1, 0, nu);
    applyDelta(c, proseWords(sc.prose) + proseWords(nu.prose) - before);
    S().activeScene = nu.id;
    W.App.save();
    W.App.render();
    W.Write.scrollToChapter(c.id, nu.id);
    const ne = proseByKey(`${c.id}:${nu.id}`);
    if (ne) {
      ne.focus();
      setSel(ne, { a: 0, as: true, f: 0, fs: true });
    }
    UI.toast("New scene started · rename it in its heading");
  }
  function normalizeParas(el) {
    let run = [];
    const wrap = (before) => {
      if (!run.length) return;
      const p = D.createElement("p");
      el.insertBefore(p, before);
      p.append(...run);
      run = [];
    };
    [...el.childNodes].forEach((n) => (n.nodeType === 1 && BLOCK_TAGS.has(n.tagName) ? wrap(n) : run.push(n)));
    wrap(null);
  }
  function syncFormatBtns() {
    D.querySelectorAll(".editor-toolbar [data-format=B],.editor-toolbar [data-format=I]").forEach((b) => {
      let on = false;
      try {
        on = D.queryCommandState(b.dataset.format === "B" ? "bold" : "italic");
      } catch (e) {}
      b.setAttribute("aria-pressed", String(on));
    });
    const sel = getSelection(),
      p = sel.rangeCount ? paraAt(sel.anchorNode) : null;
    D.querySelectorAll(".editor-toolbar [data-format=quote],.editor-toolbar [data-format=center]").forEach((b) =>
      b.setAttribute("aria-pressed", String(!!p?.classList.contains(b.dataset.format))),
    );
  }
  function format(k) {
    if (k === "break") return splitScene();
    const pos = W.Write._lastPos,
      el = pos && proseByKey(pos.key);
    if (!el || el.hidden) return UI.toast("Click into the text first");
    el.focus();
    setSel(el, pos);
    if (k === "B" || k === "I") {
      D.execCommand(k === "B" ? "bold" : "italic");
      syncFormatBtns();
      return queueSync(el);
    }
    normalizeParas(el);
    setSel(el, pos);
    const r = getSelection().getRangeAt(0),
      ps = [...el.querySelectorAll("p")].filter((p) => r.intersectsNode(p)),
      on = !ps.every((p) => p.classList.contains(k));
    ps.forEach((p) => {
      p.classList.toggle(k, on);
      p.classList.remove(k === "quote" ? "center" : "quote");
      if (!p.classList.length) p.removeAttribute("class");
    });
    syncProse(el);
    syncFormatBtns();
  }

  /* ---------- View options ---------- */
  function syncViewChecks() {
    D.querySelectorAll("[data-view-toggle]").forEach((b) => b.setAttribute("aria-checked", String(viewOn(b.dataset.viewToggle))));
  }
  function applyView() {
    const s = settingsOf();
    D.querySelector(".editor-shell")?.classList.toggle("typewriter", !!s.typewriter);
    D.querySelectorAll(".page").forEach((p) => {
      p.classList.toggle("no-ai-tint", s.aiTint === false);
      p.classList.toggle("no-prose-checks", s.proseChecks === false);
    });
  }
  function viewToggle(k) {
    if (k === "focus") {
      W.Write.toggleFocus();
      // The toolbar fades in focus mode, so land in the prose ready to type.
      if (D.body.classList.contains("focus-mode")) W.Write.focusProse();
    } else {
      settingsOf()[k] = !viewOn(k);
      W.App.save();
      applyView();
      if (k === "typewriter" && settingsOf().typewriter) centerCaret();
    }
    syncViewChecks();
  }
  function markFocus() {
    if (!D.body.classList.contains("focus-mode")) return;
    const sel = getSelection();
    let p = sel.rangeCount ? paraAt(sel.anchorNode) : null;
    if (!p) {
      const pos = W.Write._lastPos,
        el = pos && proseByKey(pos.key);
      p = (el && el.querySelectorAll("p")[Math.max(0, pos.pi)]) || D.querySelector(".prose:not([hidden]) p");
    }
    D.querySelectorAll(".focus-current").forEach((x) => x !== p && x.classList.remove("focus-current"));
    p?.classList.add("focus-current");
  }
  function centerCaret() {
    if (!settingsOf().typewriter || W.Write._ccRaf) return;
    W.Write._ccRaf = requestAnimationFrame(() => {
      W.Write._ccRaf = 0;
      const sel = getSelection(),
        ps = D.querySelector(".page-scroll");
      if (!ps || !sel.rangeCount || !sel.isCollapsed || !proseOf(sel.anchorNode)) return;
      let r = sel.getRangeAt(0).getBoundingClientRect();
      if (!r.height) r = paraAt(sel.anchorNode)?.getBoundingClientRect() || r;
      if (!r.height) return;
      const pr = ps.getBoundingClientRect();
      ps.scrollTop += r.top - (pr.top + pr.height * 0.45);
    });
  }

  /* ---------- Sprint ---------- */
  function syncSprintBtn() {
    D.querySelectorAll("[data-sprint]").forEach((b) => (b.textContent = W.Write._sprint ? "End sprint" : "Start 25-min sprint"));
  }
  function tickSprint() {
    const sp = W.Write._sprint;
    if (!sp) return;
    if (Date.now() - sp.start >= 1500000) return endSprint(false);
    const chip = D.querySelector(".sprint-chip");
    if (chip) chip.outerHTML = sprintChip();
    else D.querySelector(".editor-toolbar .spacer")?.insertAdjacentHTML("beforebegin", sprintChip());
  }
  function endSprint(manual) {
    const sp = W.Write._sprint;
    if (!sp) return;
    clearInterval(W.Write._sprintTimer);
    W.Write._sprint = null;
    D.querySelector(".sprint-chip")?.remove();
    syncSprintBtn();
    UI.toast(`${manual ? "Sprint ended" : "Sprint complete!"} · ${sp.words.toLocaleString()} words in ${Math.max(1, Math.round((Date.now() - sp.start) / 60000))} min`);
  }
  function toggleSprint() {
    if (W.Write._sprint) return endSprint(true);
    W.Write._sprint = { start: Date.now(), words: 0 };
    W.Write._sprintTimer = setInterval(tickSprint, 1000);
    tickSprint();
    syncSprintBtn();
    UI.toast("25-minute sprint started · words you add are counted");
  }

  /* ---------- Insertion point for dictation ---------- */
  function caretRange() {
    flush();
    const pos = W.Write._lastPos;
    let el = pos && proseByKey(pos.key);
    const at = (p) => {
      const r = D.createRange();
      r.setStart(p, 0);
      return r;
    };
    if (el && !el.hidden) {
      const p = el.querySelectorAll("p")[pos.pi];
      if (p && !p.textContent.trim()) {
        p.innerHTML = "";
        return at(p);
      }
      const r = rangeFrom(el, pos);
      r.collapse(false);
      return r;
    }
    el = [...D.querySelectorAll(`.prose[data-scene^="${active().id}:"]`)].filter((x) => !x.hidden).pop();
    if (!el) return null;
    const last = [...el.querySelectorAll("p")].pop();
    if (last && !last.textContent.trim()) {
      last.innerHTML = "";
      return at(last);
    }
    const p = D.createElement("p");
    el.append(p);
    return at(p);
  }
  /* ---------- Navigation helpers ---------- */
  function refreshPage() {
    flush();
    const old = D.querySelector(".editor-shell");
    if (!old) return W.App.render();
    const t = D.createElement("div");
    t.innerHTML = page();
    old.replaceWith(t.firstElementChild);
  }
  function goTo(cid, sid, toProse) {
    flush();
    const st = S(),
      unit = settingsOf().unit;
    st.activeChapter = cid;
    st.activeScene = sid;
    if (sid) delete (st.foldedScenes || {})[`${cid}:${sid}`];
    W.App.save();
    W.App.render();
    if (sid || unit === "manuscript") W.Write.scrollToChapter(cid, sid);
    else D.querySelector(".page-scroll")?.scrollTo(0, 0);
    const navBtn = toProse ? null : D.querySelector(`#leftPane [data-go-ch="${cid}"]${sid ? `[data-go-sc="${sid}"]` : ":not([data-go-sc])"}`);
    if (wide("left") && navBtn?.getClientRects().length) navBtn.focus();
    else (sid ? proseByKey(`${cid}:${sid}`) : D.querySelector(`.prose[data-scene^="${cid}:"]`))?.focus();
  }
  function toggleAct(b) {
    const ca = (S().collapsedActs = S().collapsedActs || {}),
      id = b.dataset.actToggle,
      shut = !ca[id];
    if (shut) ca[id] = 1;
    else delete ca[id];
    W.App.save();
    b.setAttribute("aria-expanded", String(!shut));
    b.closest(".nav-act")?.classList.toggle("collapsed", shut);
    b.nextElementSibling.hidden = shut;
  }
  function addChapter() {
    flush();
    const last = sorted().pop(),
      c = W.Plan?.addChapter?.(last?.act || DATA.acts[DATA.acts.length - 1].id);
    if (!c) return;
    S().activeChapter = c.id;
    S().activeScene = null;
    W.App.save();
    W.App.render();
    W.Write.scrollToChapter(c.id);
    D.querySelector(`.prose[data-scene^="${c.id}:"]`)?.focus();
    UI.toast(`Chapter ${c.n} added · plan it here or on the board`);
  }
  function toggleFold(key, btn) {
    flush();
    const f = (S().foldedScenes = S().foldedScenes || {}),
      shut = !f[key],
      sec = D.querySelector(`.scene[data-scene-key="${key}"]`);
    if (shut) f[key] = 1;
    else delete f[key];
    W.App.save();
    if (!sec) return;
    const fb = sec.querySelector(".fold-btn"),
      note = sec.querySelector(".fold-note"),
      prose = sec.querySelector(".prose");
    sec.classList.toggle("folded", shut);
    fb?.setAttribute("aria-expanded", String(!shut));
    fb?.setAttribute("aria-label", fb.getAttribute("aria-label").replace(/^(Show|Fold)/, shut ? "Show" : "Fold"));
    note.querySelector(".fold-words").textContent = `${proseWords(sceneOf(key).sc?.prose).toLocaleString()} words folded`;
    note.hidden = !shut;
    prose.hidden = shut;
    if (!shut && btn.classList.contains("link-btn")) prose.focus();
    else if (btn !== fb) fb?.focus();
  }
  function stepScene(d) {
    const c = active(),
      list = c.scenes || [],
      i = Math.max(0, list.findIndex((x) => x.id === S().activeScene)),
      n = list[Math.min(list.length - 1, Math.max(0, i + d))];
    if (!n) return;
    S().activeScene = n.id;
    W.App.save();
    refreshPage();
    refreshNav();
    (D.querySelector(`[data-step-scene="${d}"]:not([disabled])`) || D.querySelector("[data-step-scene]:not([disabled])"))?.focus();
  }
  function spy(ps) {
    if (settingsOf().unit !== "manuscript" || W.Write._spy) return;
    W.Write._spy = requestAnimationFrame(() => {
      W.Write._spy = 0;
      if (!ps.isConnected) return;
      const line = ps.getBoundingClientRect().top + 120;
      let cur = ps.querySelector("h1[data-ms-ch]")?.dataset.msCh;
      ps.querySelectorAll("h1[data-ms-ch]").forEach((h) => {
        if (h.getBoundingClientRect().top <= line) cur = h.dataset.msCh;
      });
      if (!cur || cur === S().activeChapter) return;
      S().activeChapter = cur;
      W.App.save();
      D.querySelectorAll("#leftPane .nav-item[data-go-ch]:not(.scene-row)").forEach((n) => {
        const on = n.dataset.goCh === cur;
        n.classList.toggle("active", on);
        if (on) n.setAttribute("aria-current", "true");
        else n.removeAttribute("aria-current");
      });
      const rp = D.getElementById("rightPane");
      if (S().rightTab !== "AI" && rp && !rp.contains(D.activeElement)) refreshRight();
    });
  }

  /* ---------- AI card actions ---------- */
  const cardOf = (id) => (S().aiCards || []).find((c) => c.id === id);
  function insertFromCard(b) {
    const card = cardOf(b.dataset.insertAi);
    if (!card) return;
    const text =
      b.dataset.variant != null ? card.variants?.[+b.dataset.variant] : b.dataset.group ? card.groups?.[b.dataset.group] : Array.isArray(card.body) ? card.body[0] : card.body;
    insertAI(text, { replace: REPLACE_TOOLS.has(card.tool) && !b.dataset.group });
  }
  function copyCard(b) {
    const card = cardOf(b.dataset.copy);
    if (!card) return;
    const text = cardText(card),
      ok = () => UI.toast("Copied to clipboard");
    const fallback = () => {
      const ta = D.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;opacity:0;top:0";
      D.body.append(ta);
      ta.select();
      try {
        D.execCommand("copy");
        ok();
      } catch (e) {
        UI.toast("Couldn't copy · select the text instead");
      }
      ta.remove();
      b.focus();
    };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(ok, fallback);
    else fallback();
  }
  function dismissCard(b) {
    const id = b.dataset.dismissCard,
      el = b.closest(".ai-card"),
      next = el?.nextElementSibling || el?.previousElementSibling;
    S().aiCards = (S().aiCards || []).filter((c) => c.id !== id);
    W.App.save();
    el?.remove();
    const hist = D.getElementById("aiHistory");
    if (hist && !hist.querySelector(".ai-card")) hist.innerHTML = EMPTY_AI;
    (next?.querySelector?.("[data-dismiss-card]") || D.getElementById("rtab-AI"))?.focus();
  }
  function rateCard(b) {
    const el = b.closest(".ai-card"),
      card = cardOf(el?.dataset.cardId);
    if (!card) return;
    card.rating = card.rating === b.dataset.rate ? null : b.dataset.rate;
    W.App.save();
    el.querySelectorAll("[data-rate]").forEach((x) => x.setAttribute("aria-pressed", String(card.rating === x.dataset.rate)));
    if (card.rating) UI.toast(card.rating === "up" ? "Thanks · more like this" : "Thanks · we'll steer away from this");
  }

  /* ---------- Event handlers ---------- */
  function onClick(e) {
    const q = (s) => e.target.closest(s);
    let b;
    if ((b = q("[data-go-ch]"))) return goTo(b.dataset.goCh, b.dataset.goSc || null);
    if ((b = q("[data-act-toggle]"))) return toggleAct(b);
    if (q("[data-add-chapter]")) return addChapter();
    if ((b = q("[data-right-tab]"))) {
      S().rightTab = b.dataset.rightTab;
      W.App.save();
      return refreshRight(true);
    }
    if ((b = q("[data-toggle-left]"))) return togglePane("left", undefined, b.hasAttribute("data-pane-close"));
    if ((b = q("[data-toggle-right]"))) return togglePane("right", undefined, b.hasAttribute("data-pane-close"));
    if ((b = q("[data-fm-more]"))) {
      const sub = b.nextElementSibling,
        open = sub.classList.toggle("open"),
        m = b.closest("#floatMenu");
      b.setAttribute("aria-expanded", String(open));
      // Open away from the selection so the selected text stays visible.
      if (open) sub.classList.toggle("up", m.dataset.side === "above" && m.getBoundingClientRect().top - sub.offsetHeight - 6 >= 8);
      // Keyboard activation (detail 0) moves into the submenu like the other menu buttons.
      if (open && e.detail === 0) sub.querySelector("[role=menuitem]")?.focus();
      return;
    }
    if ((b = q("[data-unit]"))) {
      settingsOf().unit = b.dataset.unit;
      W.App.save();
      refreshPage();
      if (b.dataset.unit === "manuscript") W.Write.scrollToChapter(active().id);
      return D.querySelector(".unit-btn")?.focus();
    }
    if ((b = q("[data-format]"))) return format(b.dataset.format);
    if ((b = q("[data-view-toggle]"))) return viewToggle(b.dataset.viewToggle);
    if (q("[data-read-aloud]")) return readAloud();
    if (q("[data-read-through]")) return openReadThrough();
    if (q("[data-sprint]")) return toggleSprint();
    if (q("[data-find]")) return openFind();
    if (q("[data-snapshots]")) return openSnapshots();
    if (q("[data-snap-take]")) {
      takeSnapshot(active(), "Manual");
      renderSnaps();
      D.querySelector("[data-snap-take]")?.focus();
      return UI.toast("Snapshot taken");
    }
    if ((b = q("[data-snap-diff]"))) {
      const id = b.dataset.snapDiff;
      renderSnaps(b.getAttribute("aria-pressed") === "true" ? null : id);
      return D.querySelector(`[data-snap-diff="${id}"]`)?.focus();
    }
    if ((b = q("[data-snap-restore]"))) return restoreSnap(b.dataset.snapRestore);
    if ((b = q("[data-find-go]"))) return findGo(+b.dataset.findGo);
    if ((b = q("[data-replace-one]"))) {
      const i = +b.dataset.replaceOne,
        m = W.Write._matches?.[i];
      if (!m) return;
      applyReplace([m]);
      runFind();
      return (D.querySelector(`[data-replace-one="${Math.min(i, W.Write._matches.length - 1)}"]`) || D.getElementById("findQ"))?.focus();
    }
    if (q("[data-replace-all]")) {
      const ms = W.Write._matches || [];
      if (!ms.length) return;
      new Set(ms.map((m) => m.c)).forEach((c) => takeSnapshot(c, "Before replace all"));
      const n = applyReplace(ms).size;
      runFind();
      D.getElementById("findQ")?.focus();
      return UI.toast(`Replaced ${ms.length} match${ms.length === 1 ? "" : "es"} in ${n} chapter${n === 1 ? "" : "s"} · snapshots saved first`);
    }
    if ((b = q("[data-draft]"))) return applyDraft(b.dataset.draft);
    if ((b = q("[data-draft-ch]"))) return openDraft(b.dataset.draftCh, b.dataset.draftBeat);
    if ((b = q("[data-insert-ai]"))) return insertFromCard(b);
    if ((b = q("[data-apply-summary]"))) {
      const card = cardOf(b.dataset.applySummary),
        c = active();
      if (!card) return;
      c.summary = card.body;
      W.App.save();
      const ta = D.querySelector(`[data-edit-ch="${c.id}:summary"]`);
      if (ta) ta.value = card.body;
      return UI.toast(`Summary applied to Chapter ${c.n}'s card`);
    }
    if ((b = q("[data-copy]"))) return copyCard(b);
    if ((b = q("[data-dismiss-card]"))) return dismissCard(b);
    if ((b = q("[data-rate]"))) return rateCard(b);
    if ((b = q("[data-ai]"))) {
      // Choosing a tool from the selection menus closes them; keyboard users land back in the prose.
      const menu = b.closest("#floatMenu,#contextMenu");
      if (menu) {
        const had = menu.contains(D.activeElement);
        closeMenus();
        if (had) backToProse();
      }
      return runAI(b.dataset.ai, b.dataset.preset);
    }
    if (q("[data-custom-tool]")) {
      closeMenus();
      return UI.toast("Custom tools: save a prompt with {selection} and {context} slots (coming in M2)");
    }
    if (q("[data-add-comment]")) return addComment();
    if (q("[data-comment-save]")) return saveComment();
    if (q("[data-comment-cancel]")) return cancelComment();
    if (q("[data-comment-resolve]")) return resolveComment();
    if (q("[data-grammar-fix]")) return fixGrammar();
    if (q("[data-pop-dismiss]")) return ignoreGrammar();
    if ((b = q("[data-slash]"))) return slashRun(b.dataset.slash);
    if ((b = q("[data-fold]"))) return toggleFold(b.dataset.fold, b);
    if ((b = q("[data-step-scene]"))) return stepScene(+b.dataset.stepScene);
    if ((b = q("[data-open-codex]"))) {
      flush();
      const id = b.dataset.openCodex,
        ce = codexAll().find((x) => x.id === id);
      hidePop();
      S().codexEntry = id;
      if (ce) S().codexType = ce.type;
      // Like picking a type in the Codex: show its full list, then land on the entry's row as a click there would.
      W.Codex?.clearSearch?.();
      W.App.arrive("codex");
      D.querySelector(`[data-codex-entry="${CSS.escape(id)}"]`)?.focus();
    }
  }
  function onKeydown(e) {
    const t = e.target,
      is = (s) => t.matches?.(s);
    // Keyboard-opened context menus can carry real coordinates, so remember the key that opened one.
    if (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) W.Write._kbMenuAt = performance.now();
    if (is("[data-scene-title]") && e.key === "Enter") {
      e.preventDefault();
      return proseByKey(t.dataset.sceneTitle)?.focus();
    }
    if (is("[data-comment-text]") && e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      return saveComment();
    }
    if (is("[data-comment-reply]") && e.key === "Enter") {
      e.preventDefault();
      return replyComment(t);
    }
    if (t.id === "findQ" && e.key === "Enter") {
      e.preventDefault();
      return W.Write._matches?.length && findGo(0);
    }
    if (is("[role=tab][data-right-tab]") && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
      e.preventDefault();
      const i = TABS.indexOf(t.dataset.rightTab);
      S().rightTab = TABS[e.key === "Home" ? 0 : e.key === "End" ? TABS.length - 1 : (i + (e.key === "ArrowRight" ? 1 : -1) + TABS.length) % TABS.length];
      W.App.save();
      return refreshRight(true);
    }
    const el = t.closest?.(".prose[data-scene]");
    if (!el) return;
    const s = W.Write._slash;
    if (s && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      s.i = (s.i + (e.key === "ArrowDown" ? 1 : -1) + s.items.length) % s.items.length;
      return slashRender();
    }
    if (s && (e.key === "Enter" || e.key === "Tab")) {
      e.preventDefault();
      return slashRun(s.items[s.i][0]);
    }
    if (e.key === "Enter" && e.altKey) {
      const n = getSelection().anchorNode,
        m = (n?.nodeType === 1 ? n : n?.parentElement)?.closest(".mention,.grammar,.comment-mark");
      if (!m || !el.contains(m)) return;
      e.preventDefault();
      showPop(m, m.classList.contains("comment-mark") ? "comment" : "");
      return D.querySelector("#hoverPop input, #hoverPop button")?.focus();
    }
    if ((e.ctrlKey || e.metaKey) && /^[bi]$/i.test(e.key)) setTimeout(syncFormatBtns);
  }
  // AI text stays tinted until the writer edits that text itself. Typing at either edge of it goes
  // beside the span, and only spans whose text an input actually touches are unwrapped.
  let aiHit = null;
  function aiTouched(el, sr) {
    const r = D.createRange();
    r.setStart(sr.startContainer, sr.startOffset);
    r.setEnd(sr.endContainer, sr.endOffset);
    return [...el.querySelectorAll(".ai-made")].filter((ai) => {
      if (!ai.textContent) return true;
      const inner = D.createRange();
      inner.selectNodeContents(ai);
      if (r.collapsed) {
        if (inner.comparePoint(r.startContainer, r.startOffset) !== 0) return false;
        const a = inner.cloneRange(),
          b = inner.cloneRange();
        a.setEnd(r.startContainer, r.startOffset);
        b.setStart(r.startContainer, r.startOffset);
        return !!a.toString() && !!b.toString();
      }
      const o = D.createRange(),
        s = r.compareBoundaryPoints(Range.START_TO_START, inner) > 0 ? r : inner,
        f = r.compareBoundaryPoints(Range.END_TO_END, inner) < 0 ? r : inner;
      o.setStart(s.startContainer, s.startOffset);
      o.setEnd(f.endContainer, f.endOffset);
      return !!o.toString();
    });
  }
  function onBeforeInput(e) {
    aiHit = null;
    const el = e.target.closest?.(".prose[data-scene]");
    if (!el || String(e.inputType).startsWith("format")) return;
    const sel = getSelection(),
      n = sel.anchorNode,
      ai = (n?.nodeType === 1 ? n : n?.parentElement)?.closest(".ai-made");
    if (e.inputType === "insertText" && e.data && sel.rangeCount && sel.isCollapsed && ai?.textContent && el.contains(ai)) {
      const r = sel.getRangeAt(0),
        before = D.createRange(),
        after = D.createRange();
      before.selectNodeContents(ai);
      before.setEnd(r.startContainer, r.startOffset);
      after.selectNodeContents(ai);
      after.setStart(r.startContainer, r.startOffset);
      const atStart = !before.toString(),
        atEnd = !after.toString();
      if (atStart !== atEnd) {
        e.preventDefault();
        const sib = atEnd ? ai.nextSibling : ai.previousSibling;
        let t = sib?.nodeType === 3 ? sib : null;
        if (!t) {
          t = D.createTextNode("");
          ai[atEnd ? "after" : "before"](t);
        }
        const data = e.data === " " && !t.length ? "\u00a0" : e.data,
          off = atEnd ? 0 : t.length;
        t.insertData(off, data);
        const c = D.createRange();
        c.setStart(t, off + data.length);
        sel.removeAllRanges();
        sel.addRange(c);
        aiHit = [];
        return el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: e.data }));
      }
    }
    const sr = e.getTargetRanges?.()[0];
    if (sr) aiHit = aiTouched(el, sr);
  }
  function onInput(e) {
    const t = e.target;
    if (t.matches?.("[data-scene-title]")) {
      const { c, sc } = sceneOf(t.dataset.sceneTitle);
      if (!sc) return;
      sc.title = t.textContent.replace(/\s+/g, " ").trim();
      W.App.save();
      const row = D.querySelector(`#leftPane [data-go-ch="${c.id}"][data-go-sc="${sc.id}"]`);
      if (row) row.textContent = sc.title || "Untitled scene";
      return;
    }
    const el = t.closest?.(".prose[data-scene]");
    if (el) {
      const hit = aiHit;
      aiHit = null;
      if (!String(e.inputType || "").startsWith("format")) {
        const n = getSelection().anchorNode,
          list = hit
            ? hit.filter((x) => x.isConnected && el.contains(x))
            : [(n?.nodeType === 1 ? n : n?.parentElement)?.closest(".ai-made")].filter((x) => x && el.contains(x));
        if (list.length) {
          const pos = posOf(el);
          list.forEach(unwrap);
          if (pos) setSel(el, pos);
        }
      }
      setEmpty(el);
      queueSync(el);
      slashCheck(el);
      return centerCaret();
    }
    if (t.tagName === "TEXTAREA") W.Write.autogrow();
    if (t.matches?.("[data-codex-quick]")) {
      W.Write._cq = t.value;
      const box = D.getElementById("codexQuick");
      if (box) box.innerHTML = codexQuickHTML(t.value);
    }
    if (t.id === "findQ" || t.id === "replaceQ") runFind();
  }
  function onChange(e) {
    const t = e.target;
    if (t.id === "aiModel") {
      S().aiModel = t.value;
      W.App.save();
      const cr = D.getElementById("aiCredits");
      if (cr) cr.textContent = creditsText();
      return;
    }
    if (t.matches?.("[data-token-key]")) {
      const off = (S().contextOff = S().contextOff || {});
      if (t.checked) delete off[t.dataset.tokenKey];
      else off[t.dataset.tokenKey] = 1;
      const total = tokenTotal();
      W.App.save();
      D.getElementById("tokenTotal").textContent = `${total.toLocaleString()} of ${LIMIT.toLocaleString()} tokens`;
      D.getElementById("tokenSum").textContent = total.toLocaleString();
      D.querySelector(".context-preview .meter span").style.width = Math.min(100, total / 120).toFixed(1) + "%";
      return;
    }
    if (t.id === "findCase" || t.id === "findWord") runFind();
  }
  function onPaste(e) {
    const el = e.target.closest?.(".prose[data-scene]");
    const text = (e.clipboardData?.getData("text/plain") || "").replace(/\r\n?/g, "\n");
    if (!el) {
      if (!e.target.matches?.("[data-scene-title]")) return;
      e.preventDefault();
      return D.execCommand("insertText", false, text.replace(/\s+/g, " "));
    }
    e.preventDefault();
    const parts = text.split(/\n{2,}/).filter((p) => p.trim());
    if (parts.length < 2) D.execCommand("insertText", false, text);
    else D.execCommand("insertHTML", false, parts.map((p) => `<p>${UI.esc(p).replace(/\n/g, "<br>")}</p>`).join(""));
  }
  function onMousedown(e) {
    const t = e.target;
    if (t.closest("#floatMenu button,#contextMenu button,#slashMenu button,[data-format],.editor-toolbar [data-ai],.editor-toolbar [data-dictate]")) e.preventDefault();
    if (!t.closest("#floatMenu,#contextMenu")) closeMenus();
    if (!t.closest("#slashMenu")) slashClose();
    if (t.closest("#hoverPop")) return;
    if (W.Write._pendingMark) {
      const mark = W.Write._pendingMark;
      W.Write._pendingMark = null;
      hidePop();
      if (mark.isConnected) {
        const el = proseOf(mark);
        unwrap(mark);
        el?.normalize();
      }
    } else if (!t.closest(".mention,.grammar,.comment-mark")) hidePop();
  }
  function onMouseup(e) {
    const m = D.getElementById("floatMenu");
    if (!m || e.button !== 0 || e.target.closest("#floatMenu,#hoverPop,#contextMenu")) return;
    setTimeout(() => {
      const sel = getSelection();
      if (!sel.rangeCount || String(sel).trim().length <= 3 || !proseOf(sel.anchorNode) || !proseOf(sel.focusNode)) return m.classList.remove("open");
      const r = sel.getRangeAt(0).getBoundingClientRect(),
        col = (D.querySelector(".page-scroll") || D.body).getBoundingClientRect();
      m.querySelector(".fm-sub")?.classList.remove("open");
      m.querySelector("[data-fm-more]")?.setAttribute("aria-expanded", "false");
      m.style.maxWidth = Math.max(240, col.width - 16) + "px";
      m.classList.add("open");
      const w = m.offsetWidth,
        h = m.offsetHeight,
        left = Math.min(Math.max(col.left + 8, r.left + r.width / 2 - w / 2), col.right - w - 8),
        above = r.top - h - 10;
      m.dataset.side = above >= col.top + 4 ? "above" : "below";
      m.style.left = Math.max(8, left) + "px";
      m.style.top = (above >= col.top + 4 ? above : r.bottom + 10) + "px";
    });
  }
  function onContextmenu(e) {
    const sel = getSelection();
    if (!e.target.closest(".prose") || !sel.rangeCount || sel.isCollapsed || !proseOf(sel.anchorNode)) return;
    e.preventDefault();
    const m = D.getElementById("contextMenu"),
      kb = (!e.clientX && !e.clientY) || performance.now() - (W.Write._kbMenuAt || -1e4) < 1500,
      r = sel.getRangeAt(0).getBoundingClientRect();
    W.Write._kbMenuAt = 0;
    closeMenus();
    m.classList.add("open");
    if (kb) placeCtx(m, r.left, r.bottom + 6);
    else placeCtx(m, e.clientX, e.clientY);
    if (kb) m.querySelector("button")?.focus();
  }
  function placeCtx(m, x, y) {
    m.style.left = Math.max(8, Math.min(innerWidth - m.offsetWidth - 8, x)) + "px";
    m.style.top = Math.max(8, Math.min(innerHeight - m.offsetHeight - 8, y)) + "px";
  }
  function onMouseover(e) {
    if (e.target.closest("#hoverPop")) return clearTimeout(W.Write._popTimer);
    const m = e.target.closest(".mention,.grammar,.comment-mark:not(.pending)"),
      p = D.getElementById("hoverPop");
    if (!m || !p || !proseOf(m) || (m.classList.contains("grammar") && m.closest(".no-prose-checks"))) return;
    if (W.Write._pendingMark || (p.classList.contains("open") && p.contains(D.activeElement))) return;
    if (W.Write._popFor === m && p.classList.contains("open")) return clearTimeout(W.Write._popTimer);
    showPop(m, m.classList.contains("comment-mark") ? "comment" : "");
  }
  // The card closes after the pointer leaves both trigger and card; the grace period lets it travel into the card.
  function onMouseout(e) {
    const from = e.target.closest(".mention,.grammar,.comment-mark,#hoverPop");
    if (!from || from.contains(e.relatedTarget) || W.Write._pendingMark) return;
    clearTimeout(W.Write._popTimer);
    W.Write._popTimer = setTimeout(() => {
      const p = D.getElementById("hoverPop");
      if (!p || W.Write._pendingMark || p.matches(":hover") || p.contains(D.activeElement) || D.querySelector(".mention:hover,.grammar:hover,.comment-mark:hover")) return;
      p.classList.remove("open");
      W.Write._popFor = null;
    }, 250);
  }
  function onScroll(e) {
    if (!e.target.classList?.contains("page-scroll")) return;
    const ctx = D.getElementById("contextMenu"),
      sel = getSelection();
    // A keyboard-opened menu follows its selection: browsers may scroll to reveal the selection as the menu opens.
    if (ctx?.classList.contains("open") && ctx.contains(D.activeElement) && sel.rangeCount) {
      const r = sel.getRangeAt(0).getBoundingClientRect();
      placeCtx(ctx, r.left, r.bottom + 6);
    } else {
      const had = D.activeElement?.closest?.("#floatMenu,#contextMenu");
      closeMenus();
      if (had) backToProse();
    }
    const p = D.getElementById("hoverPop");
    if (p?.classList.contains("open")) {
      if ((W.Write._pendingMark || p.contains(D.activeElement)) && W.Write._popFor?.isConnected) placePop(p, W.Write._popFor.getBoundingClientRect());
      else hidePop();
    }
    slashPlace();
    spy(e.target);
  }
  let bound = false;
  function bindOnce() {
    if (bound) return;
    bound = true;
    try {
      D.execCommand("defaultParagraphSeparator", false, "p");
    } catch (e) {}
    D.addEventListener("selectionchange", () => {
      if (S().screen !== "write") return;
      const sel = getSelection(),
        el = sel.rangeCount ? proseOf(sel.anchorNode) : null;
      if (!el) return;
      W.Write._lastPos = posOf(el, sel);
      syncFormatBtns();
      markFocus();
      if (sel.isCollapsed) centerCaret();
    });
    addEventListener("pagehide", flush);
    D.addEventListener("visibilitychange", () => D.visibilityState === "hidden" && flush());
    addEventListener("resize", () => S().screen === "write" && syncPaneButtons());
  }

  W.Write = {
    _lastPos: null,
    _sprint: null,
    _speaking: false,
    _cq: "",
    render() {
      ensureIds();
      const s = settingsOf();
      return `<section class="write-layout${s.hideLeft ? " hide-left" : ""}${s.hideRight ? " hide-right" : ""}">${nav()}${page()}${rightPanel()}${overlays()}</section>`;
    },
    runAI,
    insertAI,
    stream(card, done) {
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) return done?.();
      const walker = D.createTreeWalker(card, NodeFilter.SHOW_TEXT, {
        acceptNode: (n) =>
          n.textContent.trim() && !n.parentElement.closest(".ai-card-head,.ai-actions,button") ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
      });
      const parts = [];
      while (walker.nextNode()) parts.push({ n: walker.currentNode, words: walker.currentNode.textContent.split(/(\s+)/) });
      parts.forEach((p) => (p.n.textContent = ""));
      const stop = D.createElement("button");
      stop.className = "small-btn stop-stream";
      stop.dataset.stopStream = "";
      stop.textContent = "Stop";
      card.querySelector(".ai-card-head")?.append(stop);
      card.classList.add("streaming");
      let i = 0,
        j = 0;
      const finish = (stopped) => {
        clearInterval(timer);
        const had = D.activeElement === stop;
        card.classList.remove("streaming");
        stop.remove();
        done?.(stopped === true);
        // Stop vanishes when the stream ends; keep keyboard focus in the card.
        if (had && card.isConnected && D.activeElement === D.body) card.querySelector(".ai-actions button")?.focus();
      };
      const timer = setInterval(() => {
        if (!card.isConnected) return clearInterval(timer);
        for (let k = 0; k < 2 && parts[i]; k++) {
          parts[i].n.textContent += parts[i].words[j++] || "";
          if (j >= parts[i].words.length) {
            i++;
            j = 0;
          }
        }
        if (!parts[i]) finish();
      }, 28);
      stop.addEventListener("click", () => {
        finish(true);
        if (card.isConnected && D.activeElement === D.body) card.querySelector(".ai-actions button")?.focus();
      });
    },
    toggleFocus() {
      if (D.body.classList.contains("focus-mode")) return this.exitFocus();
      ensureWrite();
      D.body.classList.add("focus-mode");
      markFocus();
      syncViewChecks();
      UI.toast("Focus mode · Esc or Ctrl+. to leave");
    },
    exitFocus() {
      if (!D.body.classList.contains("focus-mode")) return;
      D.body.classList.remove("focus-mode");
      D.querySelectorAll(".focus-current").forEach((p) => p.classList.remove("focus-current"));
      syncViewChecks();
      UI.setTheme(S().settings.theme);
    },
    autogrow() {
      D.querySelectorAll("textarea").forEach((t) => {
        t.style.height = "auto";
        t.style.height = Math.min(260, t.scrollHeight + 2) + "px";
      });
    },
    scrollToChapter(id, sceneId) {
      const ps = D.querySelector(".page-scroll"),
        target = ps && ((sceneId && proseByKey(`${id}:${sceneId}`)?.closest(".scene")) || ps.querySelector(`h1[data-ms-ch="${id}"]`));
      if (target) ps.scrollTop += target.getBoundingClientRect().top - ps.getBoundingClientRect().top - 24;
    },
    // Links from Plan and Codex land in the chapter's prose, ready to type.
    openChapter(cid) {
      S().screen = "write";
      goTo(cid, null, true);
    },
    // Lands where the writer left off (or the top of the chapter), with the caret in view.
    focusProse() {
      const vis = (el) => (el?.getClientRects().length ? el : null),
        pos = W.Write._lastPos,
        el = vis(pos && proseByKey(pos.key)) || [...D.querySelectorAll(`.prose[data-scene^="${S().activeChapter}:"]`)].find(vis);
      if (!el) return false;
      backToProse(el);
      const ps = D.querySelector(".page-scroll"),
        sel = getSelection(),
        r = sel.rangeCount && sel.getRangeAt(0).getClientRects()[0];
      if (ps && r) {
        const pr = ps.getBoundingClientRect();
        if (r.top < pr.top || r.bottom > pr.bottom) ps.scrollTop += r.top - pr.top - pr.height / 3;
      }
      return true;
    },
    onEscape() {
      if (W.Write._slash) return slashClose(), true;
      // While dictating into a comment, the first Esc only stops listening.
      if (D.getElementById("hoverPop")?.contains(W.Voice?.sess?.btn)) return W.Voice.halt();
      if (W.Write._pendingMark) return cancelComment(), true;
      const sub = D.querySelector("#floatMenu .fm-sub.open"),
        more = D.querySelector("[data-fm-more]");
      if (sub && (sub.contains(D.activeElement) || D.activeElement === more)) {
        sub.classList.remove("open");
        more?.setAttribute("aria-expanded", "false");
        more?.focus();
        return true;
      }
      const menu = [D.getElementById("contextMenu"), D.getElementById("floatMenu")].find((m) => m?.classList.contains("open") && m.contains(D.activeElement));
      if (menu) {
        closeMenus();
        backToProse();
        return true;
      }
      const h = hidePop();
      if (h) {
        if (h === "focus") backToProse();
        return true;
      }
      if (stopSpeech()) return UI.toast("Stopped reading"), true;
      return false;
    },
    wire(root) {
      bindOnce();
      root.addEventListener("click", (e) => {
        onClick(e);
        // A menu item that didn't move focus elsewhere hands it back to its menu button.
        const pop = e.target.closest(".menu-pop");
        if (pop && (D.activeElement === D.body || pop.contains(D.activeElement)) && getComputedStyle(pop).display === "none")
          pop.closest(".menu-wrap")?.querySelector("[data-menu-toggle]")?.focus();
      });
      root.addEventListener("keydown", onKeydown);
      root.addEventListener("beforeinput", onBeforeInput);
      root.addEventListener("input", onInput);
      root.addEventListener("change", onChange);
      root.addEventListener("paste", onPaste);
      root.addEventListener("mousedown", onMousedown);
      root.addEventListener("mouseup", onMouseup);
      root.addEventListener("contextmenu", onContextmenu);
      root.addEventListener("mouseover", onMouseover);
      root.addEventListener("mouseout", onMouseout);
      root.addEventListener("scroll", onScroll, true);
      root.addEventListener("focusout", (e) => {
        const el = e.target.closest?.(".prose[data-scene]");
        if (el) syncProse(el);
      });
      syncPaneButtons();
    },
    flush,
    ensureWrite,
    viewToggle,
    toggleSprint,
    readAloud,
    addChapter,
    openFind,
    openSnapshots,
    openReadThrough,
    openDraft,
    stopSpeech,
    mentionCounts,
    syncProse,
    refreshProse,
    proseHTML,
    wc,
    proseWords,
    caretRange,
    proseByKey,
  };
})();
