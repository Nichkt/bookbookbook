(function () {
  "use strict";
  const W = window,
    UI = W.UI,
    DATA = W.BOOKBOOKBOOK_DATA,
    D = document;
  const S = () => W.App.state;
  const ch = (id) => S().chapters.find((c) => c.id === id);
  const actChapters = (act) => S().chapters.filter((c) => c.act === act.id).sort((a, b) => a.n - b.n);
  const VIEWS = ["board", "outline", "matrix", "timeline", "corkboard"];
  const STATUSES = ["Idea", "Outlined", "Drafting", "Revising", "Done"];
  const POVS = ["Mara", "Jonas", "Thomas"];
  const DISPLAY = [
    ["summary", "Summaries"],
    ["meta", "Threads & tags"],
    ["progress", "Progress bars"],
    ["compact", "Compact cards"],
  ];
  const SNOW = ["One-sentence summary", "One-paragraph summary", "Character summaries", "Expand to one page", "Character synopses", "Four-page synopsis", "Character charts", "Scene list"];
  const display = () => ({ summary: true, meta: true, progress: true, compact: false, ...(S().planDisplay || {}) });
  const filter = () => ({ pov: "", status: "", thread: "", ...(S().planFilter || {}) });
  const filterCount = () => Object.values(filter()).filter(Boolean).length;
  const tpl = () => DATA.templates.find((t) => t.id === S().template) || DATA.templates[1];
  function hit(c) {
    const f = filter();
    return (!f.pov || c.pov === f.pov) && (!f.status || c.status === f.status) && (!f.thread || (c.threads || []).includes(f.thread));
  }
  const dim = (c) => (hit(c) ? "" : " dimmed");
  // Chapter numbers follow act order, then position within the act.
  function renumber() {
    const order = DATA.acts.map((a) => a.id);
    S()
      .chapters.sort((a, b) => order.indexOf(a.act) - order.indexOf(b.act) || a.n - b.n)
      .forEach((c, i) => (c.n = i + 1));
  }
  function viewClass() {
    const d = display();
    return (
      ["summary", "meta", "progress"]
        .filter((k) => !d[k])
        .map((k) => ` pv-hide-${k}`)
        .join("") + (d.compact ? " pv-compact" : "")
    );
  }
  const filterLabel = () => `${UI.icon("filter")} Filter${filterCount() ? ` · ${filterCount()}` : ""}`;

  /* ---------- Views ---------- */
  function toolbar() {
    const s = S().settings,
      d = display(),
      f = filter();
    const sel = (key, label, opts) =>
      `<label class="field compact-field"><span>${label}</span><select data-plan-filter="${key}"><option value="">All</option>${opts.map(([v, t]) => `<option value="${UI.esc(v)}"${f[key] === v ? " selected" : ""}>${UI.esc(t)}</option>`).join("")}</select></label>`;
    return `<div class="subbar">
      <div class="seg plan-view-seg" role="group" aria-label="Plan view">${VIEWS.map((v) => `<button data-plan-view="${v}" aria-pressed="${s.view === v}" class="${s.view === v ? "active" : ""}">${UI.cap(v)}</button>`).join("")}</div>
      <div class="menu-wrap"><button class="small-btn subbar-btn" data-menu-toggle="plan-display" aria-haspopup="menu" aria-expanded="false">Display ▾</button><div class="menu-pop" data-menu-pop="plan-display" role="menu" aria-label="Card display">${DISPLAY.map(([k, label]) => `<button role="menuitemcheckbox" aria-checked="${!!d[k]}" data-plan-display="${k}">${label}</button>`).join("")}</div></div>
      <select class="small-btn subbar-btn structure-select" data-template aria-label="Structure template">${DATA.templates.map((t) => `<option value="${t.id}" ${S().template === t.id ? "selected" : ""}>${UI.esc(t.name)}</option>`).join("")}</select>
      <button class="small-btn subbar-btn${s.overlay ? " active" : ""}" data-toggle-overlay aria-pressed="${!!s.overlay}" title="Show the template's beats above the board">Overlay</button>
      <div class="menu-wrap"><button class="small-btn subbar-btn${filterCount() ? " active" : ""}" data-menu-toggle="plan-filter" aria-haspopup="dialog" aria-expanded="false">${filterLabel()}</button><div class="menu-pop filter-pop" data-menu-pop="plan-filter" role="dialog" aria-label="Filter chapters">${sel("pov", "POV", POVS.map((p) => [p, p]))}${sel("status", "Status", STATUSES.map((x) => [x, x]))}${sel("thread", "Thread", DATA.threads.map((t) => [t.id, t.name]))}<button class="small-btn" data-plan-filter-clear>Clear filters</button></div></div>
      <span class="spacer"></span><button class="small-btn subbar-btn" data-add-chapter>${UI.icon("plus")} Chapter</button>
    </div>`;
  }
  // Markers come from each chapter's Template beat, so mapping a beat in the drawer moves it here.
  function ribbon() {
    if (!S().settings.overlay) return "";
    return `<div class="overlay-ribbon" title="Template overlay">${tpl()
      .beats.map(([b, p]) => {
        const c = S().chapters.find((x) => x.beat === b),
          row = Math.min(2, Math.floor(p / 8) % 3),
          left = Math.max(3, Math.min(97, p)),
          edge = p < 12 ? " edge-left" : p > 88 ? " edge-right" : "";
        return `<button class="marker ${c ? "mapped" : "unmapped"} row-${row}${edge}" style="left:${left}%" data-beat-name="${UI.esc(b)}"${c ? ` data-beat-ch="${c.id}"` : ""} title="${UI.esc(b)}${c ? ` · Ch ${c.n}` : " · not mapped yet"}"><span class="tick"></span><span class="marker-label">${UI.esc(b)}${c ? ` · Ch ${c.n}` : ""}</span></button>`;
      })
      .join("")}</div>`;
  }
  function card(c) {
    const pct = Math.min(100, Math.round(((c.words || 0) / (c.target || 3000)) * 100)),
      threads = (c.threads || []).map((id) => DATA.threads.find((t) => t.id === id)).filter(Boolean),
      beats = c.beats || [];
    return `<article class="chapter-card${dim(c)}" draggable="true" tabindex="0" data-chapter="${c.id}" aria-label="Chapter ${c.n}: ${UI.esc(c.title)}" aria-describedby="cardHelp">
      <div class="card-top"><div class="num">Ch<br>${c.n}</div><div><h3>${UI.esc(c.title)}</h3><div>${UI.status(c.status)} <span class="tag">${UI.esc(c.pov || "")}</span></div></div></div>
      <p class="summary">${c.summary ? UI.esc(c.summary) : `<span class="muted">No summary yet</span>`}</p>
      <div class="meta">${threads.map((t) => `<span class="tag"><span class="dot" style="background:${t.color}"></span> ${UI.esc(t.name)}</span>`).join("")}${c.place ? `<span class="tag">${UI.esc(c.place)}</span>` : ""}${c.time ? `<span class="tag">${UI.esc(c.time)}</span>` : ""}${c.beat ? `<span class="tag">${UI.esc(c.beat)}</span>` : ""}</div>
      <div class="progress"><span style="width:${pct}%"></span></div><small class="card-count">${(c.words || 0).toLocaleString()} / ${(c.target || 0).toLocaleString()} words · ${beats.filter((b) => b[1]).length}/${beats.length} beats</small>
    </article>`;
  }
  function board() {
    return `<div class="content"><div class="board">${ribbon()}${DATA.acts
      .map((a) => {
        const list = actChapters(a);
        return `<section class="act-row" data-act="${a.id}" aria-label="${UI.esc(a.title)}"><div class="act-head"><h2>${UI.esc(a.title)}</h2><span class="act-tools"><span class="chip">${list.reduce((m, c) => m + (c.words || 0), 0).toLocaleString()} words</span><button class="icon-btn mini" data-add-chapter="${a.id}" aria-label="Add a chapter to ${UI.esc(a.title)}" title="Add chapter">${UI.icon("plus")}</button></span></div><div class="cards">${list.map(card).join("")}</div></section>`;
      })
      .join("")}<p id="cardHelp" hidden>Enter opens the chapter. Alt plus arrow keys move it.</p></div></div>`;
  }
  function outline() {
    return `<div class="content"><div class="outline">${DATA.acts
      .map(
        (a) =>
          `<h2>${UI.esc(a.title)}</h2>${actChapters(a)
            .map(
              (c) =>
                `<div class="tree-row${dim(c)}"><strong>${c.n}</strong><button class="link-btn" data-open-chapter="${c.id}">${UI.esc(c.title)}</button>${UI.status(c.status)}<span>${(c.words || 0).toLocaleString()}/${(c.target || 0).toLocaleString()}</span><div class="tree-summary" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Chapter ${c.n} summary" data-summary="${c.id}">${UI.esc(c.summary || "")}</div><div class="tree-summary">${(c.beats || []).map((b, i) => `<label class="check"><input type="checkbox" data-beat="${c.id}:${i}" ${b[1] ? "checked" : ""}> ${UI.esc(b[0])}</label>`).join("") || `<span class="muted">No beats yet</span>`}</div></div>`,
            )
            .join("")}`,
      )
      .join("")}</div></div>`;
  }
  function matrix() {
    const chs = S().chapters,
      chars = DATA.codex.filter((e) => e.type === "Characters").map((e) => e.name),
      actSpans = DATA.acts.map((a) => chs.filter((c) => c.act === a.id).length);
    const quiet = (threadId, idx) => {
      const arr = chs.map((c) => (c.threads || []).includes(threadId));
      if (arr[idx]) return false;
      let l = idx,
        r = idx;
      while (l > 0 && !arr[l - 1]) l--;
      while (r < arr.length - 1 && !arr[r + 1]) r++;
      return r - l + 1 >= 3 && arr[l - 1] && arr[r + 1];
    };
    const cell = (kind, id, c, on, mark, label) =>
      `<button class="mx-btn" data-matrix-cell data-kind="${kind}" data-id="${UI.esc(id)}" data-chapter-id="${c.id}" aria-pressed="${on}" aria-label="${UI.esc(label)} in chapter ${c.n}">${mark}</button>`;
    const charRows = chars
      .map(
        (name) =>
          `<tr><td><strong>${UI.esc(UI.cap(name))}</strong></td>${chs
            .map((c) => {
              const pov = !!c.pov && name.startsWith(c.pov),
                on = (c.chars || []).includes(name);
              return `<td>${cell("character", name, c, on, pov ? "★" : on ? "●" : "·", UI.cap(name) + (pov ? " (POV)" : ""))}</td>`;
            })
            .join("")}</tr>`,
      )
      .join("");
    const threadRows = DATA.threads
      .map(
        (t) =>
          `<tr><td><strong><span class="dot" style="background:${t.color}"></span> ${UI.esc(t.name)}</strong></td>${chs
            .map((c, i) => {
              const on = (c.threads || []).includes(t.id),
                q = quiet(t.id, i);
              return `<td${q ? ' class="quiet" title="Thread quiet for 3 chapters"' : ""}>${cell("thread", t.id, c, on, on ? "●" : "·", t.name)}</td>`;
            })
            .join("")}</tr>`,
      )
      .join("");
    return `<div class="content"><div class="matrix"><table><thead><tr><th></th>${DATA.acts.map((a, i) => (actSpans[i] ? `<th colspan="${actSpans[i]}">${UI.esc(a.title)}</th>` : "")).join("")}</tr><tr><th>Matrix</th>${chs.map((c) => `<th class="${dim(c).trim()}">Ch ${c.n}<br><small>${UI.esc(c.title)}</small></th>`).join("")}</tr></thead><tbody><tr class="group-row"><td colspan="${chs.length + 1}">Characters</td></tr>${charRows}<tr class="group-row"><td colspan="${chs.length + 1}">Plot threads</td></tr>${threadRows}</tbody></table><p class="matrix-legend"><span>★ POV</span><span>● Appears</span><span>· Absent</span><span><i class="swatch"></i>Thread quiet 3+ chapters</span><span>Click a cell to toggle it</span></p></div></div>`;
  }
  function timeline() {
    const story = S().timelineOrder !== "reading",
      count = S().chapters.length;
    // Story order: flashback chapters get a fixed-width "past" column; the main story (Day 1–9) spans the rest.
    const PAST = story ? 232 : 0,
      BLOCK = 170,
      WRAP_PAD = 18;
    const storyF = { 1: 0, 2: 0.07, 3: 0.18, 4: 0.25, 5: 0.36, 6: 0.43, 7: 0.45, 8: 0.52, 10: 0.74, 11: 0.9, 12: 1 };
    const isPast = (c) => story && /earlier/i.test(c.time || "");
    const fOf = (c) => (story ? (storyF[c.n] ?? 1) : (c.n - 1) / Math.max(1, count - 1));
    const at = (f, pad = 0) => `calc(${pad + PAST}px + (100% - ${2 * pad + PAST + BLOCK}px) * ${f})`;
    const laneBlock = (c, idx) =>
      `<button class="tl-block${dim(c)}" data-open-chapter="${c.id}" title="Ch ${c.n} · ${UI.esc(c.title)} · ${UI.esc(c.time)}" style="left:${isPast(c) ? "12px" : at(fOf(c))};top:${30 + (idx % 3) * 56}px"><b>Ch ${c.n} · ${UI.esc(c.title)}</b><small>${UI.esc(c.time || "No date")}</small></button>`;
    const gapAt = WRAP_PAD + PAST - 26;
    const events = story
      ? `<div class="event-label" style="left:${WRAP_PAD + 12}px"><span class="event"></span>Night Ferry · 12 years earlier</div><div class="tl-gap" style="left:${gapAt}px" title="12-year gap"></div><div class="event-label" style="left:${at(0, WRAP_PAD)}"><span class="event"></span>Thomas drowns</div><div class="event-label" style="left:${at(storyF[6], WRAP_PAD)}"><span class="event"></span>The Storm</div>`
      : "";
    return `<div class="content"><div class="timeline"><div class="timeline-head"><strong>Timeline</strong><div class="seg" role="group" aria-label="Order"><button data-timeline-order="story" aria-pressed="${story}" class="${story ? "active" : ""}">Story order</button><button data-timeline-order="reading" aria-pressed="${!story}" class="${story ? "" : "active"}">Reading order</button></div></div><div class="timeline-wrap ${story ? "" : "reading"}"${story ? ` style="--past-edge:${gapAt}px"` : ""}>${events}${POVS.map((p) => {
      const mine = S().chapters.filter((c) => c.pov === p);
      return `<div class="lane" style="height:${36 + Math.min(3, Math.max(1, mine.length)) * 56}px"><div class="lane-label">${p}</div>${mine.map(laneBlock).join("")}</div>`;
    }).join("")}</div></div></div>`;
  }
  function cork() {
    return `<div class="content"><div class="cork"><div class="cork-grid">${S()
      .chapters.map((c, i) => `<button class="index-card${dim(c)}" data-open-chapter="${c.id}" style="--rot:${((i % 5) - 2) * 0.55}deg"><div class="pin"></div><h3>Ch ${c.n} · ${UI.esc(c.title)}</h3><p>${UI.esc(c.summary || "No summary yet")}</p></button>`)
      .join("")}</div></div></div>`;
  }
  const VIEW_FN = { board, outline, matrix, timeline, corkboard: cork };
  const viewHTML = () => (VIEW_FN[S().settings.view] || board)();

  /* ---------- Chapter drawer ---------- */
  function beatRowsHTML(c, mode) {
    return (
      (c.beats || [])
        .map(
          (b, i) =>
            `<div class="check beat-row"><input type="checkbox" data-beat="${c.id}:${i}" aria-label="Beat ${i + 1} done"${b[1] ? " checked" : ""}><input class="beat-text" data-beat-text="${c.id}:${i}" value="${UI.esc(b[0])}" aria-label="Beat ${i + 1}" placeholder="Describe this beat…">${mode === "write" ? `<button class="icon-btn mini draft-mini" data-draft-ch="${c.id}" data-draft-beat="${i}" aria-label="Draft beat ${i + 1} with AI" title="Draft this beat">${UI.icon("spark")}</button>` : ""}<button class="icon-btn mini" data-remove-beat="${c.id}:${i}" aria-label="Remove beat ${i + 1}" title="Remove beat">${UI.icon("x")}</button></div>`,
        )
        .join("") || `<p class="muted beat-empty">No beats yet.</p>`
    );
  }
  const mic = (kind, label) => `<button class="icon-btn mini" data-inline-mic="${kind}" aria-label="Dictate ${label}" title="Dictate ${label}">${UI.icon("mic")}</button>`;
  function drawer(c) {
    const t = tpl(),
      names = t.beats.map((b) => b[0]);
    if (c.beat && !names.includes(c.beat)) names.unshift(c.beat);
    return UI.drawer(`<button class="icon-btn" data-close aria-label="Close" style="float:right">${UI.icon("x")}</button><h2 id="drawerTitle">Chapter ${c.n}: ${UI.esc(c.title)}</h2>
    <label class="field"><span>Title</span><input data-edit-ch="${c.id}:title" value="${UI.esc(c.title)}" data-autofocus></label>
    <div class="grid cols"><label class="field"><span>Status</span><select data-edit-ch="${c.id}:status">${STATUSES.map((s) => `<option${s === c.status ? " selected" : ""}>${s}</option>`).join("")}</select></label><label class="field"><span>POV</span><select data-edit-ch="${c.id}:pov">${POVS.map((p) => `<option${p === c.pov ? " selected" : ""}>${p}</option>`).join("")}</select></label><label class="field"><span>Target words</span><input type="number" min="100" max="200000" step="100" data-edit-ch="${c.id}:target" value="${c.target || 3000}"></label></div>
    <div class="field"><span id="thr-${c.id}">Plot threads</span><div class="aliases" role="group" aria-labelledby="thr-${c.id}">${DATA.threads.map((th) => `<button class="tag thread-toggle" data-thread-toggle="${c.id}:${th.id}" aria-pressed="${(c.threads || []).includes(th.id)}"><span class="dot" style="background:${th.color}"></span> ${UI.esc(th.name)}</button>`).join("")}</div></div>
    <label class="field"><span>Template beat · ${UI.esc(t.name)}</span><select data-edit-ch="${c.id}:beat"><option value="">None</option>${names.map((b) => `<option${b === c.beat ? " selected" : ""}>${UI.esc(b)}</option>`).join("")}</select></label>
    <div class="grid cols"><label class="field"><span>Location</span><input data-edit-ch="${c.id}:place" value="${UI.esc(c.place || "")}"></label><label class="field"><span>In-story date/time</span><input data-edit-ch="${c.id}:time" value="${UI.esc(c.time || "")}"></label></div>
    <div class="field"><span>Characters present</span><div class="aliases">${(c.chars || []).map((x) => `<span class="tag">${UI.esc(UI.cap(x))}</span>`).join("")}<span class="tag muted">auto from prose</span></div></div>
    <div class="field"><span class="label-row"><label for="dSum-${c.id}">Summary</label>${mic("summary", "summary")}</span><textarea id="dSum-${c.id}" data-edit-ch="${c.id}:summary" placeholder="What happens in this chapter?">${UI.esc(c.summary || "")}</textarea></div>
    <div class="field"><span class="label-row"><span>Beats</span>${mic("beats", "a beat")}</span>${W.Plan.beatRows(c, "drawer")}</div>
    <div class="field"><span class="label-row"><label for="dNotes-${c.id}">Notes</label>${mic("notes", "notes")}</span><textarea id="dNotes-${c.id}" data-edit-ch="${c.id}:notes" placeholder="Notes for this chapter">${UI.esc(c.notes || "")}</textarea></div>
    <div class="grid cols"><button class="pill-btn active" data-write-chapter="${c.id}">Write ▸</button><button class="small-btn" data-summarize="${c.id}">Summarize with AI</button></div>`);
  }
  function templatesModal() {
    return UI.modal(
      "templateModal",
      "New book from template",
      `<div class="grid cols">${DATA.templates
        .map(
          (t) => {
            const verb = t.id === "snowflake" ? "Open wizard" : "Create";
            return `<div class="template-card"><h3>${UI.esc(t.name)}</h3><p>${UI.esc(t.desc)}</p><small>${t.beats
              .slice(0, 6)
              .map((b) => UI.esc(b[0]))
              .join(" · ")}</small><br><button class="small-btn" data-create-template="${t.id}" aria-label="${verb}: ${UI.esc(t.name)}">${verb}</button></div>`;
          },
        )
        .join(
          "",
        )}</div><div id="snowflakeWizard" hidden><h3>Snowflake wizard · <span id="snowStepName">Step 1 · ${SNOW[0]}</span></h3><div class="seg" role="group" aria-label="Wizard step">${SNOW.map((s, i) => `<button data-snow-step="${i}" aria-pressed="${i === 0}" class="${i === 0 ? "active" : ""}" title="${s}" aria-label="Step ${i + 1}: ${s}">${i + 1}</button>`).join("")}</div><textarea id="snowText" aria-labelledby="snowStepName" placeholder="${SNOW[0]}…"></textarea><p><button class="small-btn" data-snow-nav="-1">Back</button> <button class="pill-btn active" data-snow-nav="1">Next</button></p></div>`,
    );
  }
  /* ---------- Actions ---------- */
  function setFilter(key, val) {
    S().planFilter = key ? { ...filter(), [key]: val } : { pov: "", status: "", thread: "" };
    W.App.save();
    W.Plan.refresh();
    const t = D.querySelector('[data-menu-toggle="plan-filter"]');
    if (t) {
      t.innerHTML = filterLabel();
      t.classList.toggle("active", !!filterCount());
    }
    if (!key) D.querySelectorAll("[data-plan-filter]").forEach((s) => (s.value = ""));
    UI.toast(filterCount() ? `${S().chapters.filter(hit).length} of ${S().chapters.length} chapters match` : "Filters cleared");
  }
  function toggleDisplay(b) {
    const d = display(),
      k = b.dataset.planDisplay;
    d[k] = !d[k];
    S().planDisplay = d;
    W.App.save();
    b.setAttribute("aria-checked", String(d[k]));
    const sec = D.querySelector(".plan-view");
    if (sec) sec.className = `view plan-view${viewClass()}`;
    setTimeout(() => W.Plan.layoutRibbon(), 0);
  }
  function setView(v) {
    S().settings.view = v;
    W.App.save();
    D.querySelectorAll("[data-plan-view]").forEach((b) => {
      const on = b.dataset.planView === v;
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", String(on));
    });
    W.Plan.refresh(false);
  }
  function pulse(cid) {
    const el = D.querySelector(`[data-chapter="${cid}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    el.focus({ preventScroll: true });
    el.classList.add("pulse");
    setTimeout(() => el.classList.remove("pulse"), 1200);
  }
  function addFromPlan(actId) {
    const c = W.Plan.addChapter(actId || DATA.acts[DATA.acts.length - 1].id);
    W.Plan.refresh();
    W.Plan.openDrawer(c.id);
    const t = D.querySelector(`#drawer [data-edit-ch="${c.id}:title"]`);
    t?.focus();
    t?.select();
    UI.toast(`Chapter ${c.n} added`);
  }
  function moveCard(id, key) {
    const c = ch(id),
      acts = DATA.acts.map((a) => a.id);
    if (key === "ArrowLeft" || key === "ArrowRight") {
      const list = actChapters({ id: c.act }),
        j = list.indexOf(c) + (key === "ArrowLeft" ? -1 : 1);
      if (!list[j]) return UI.toast(j < 0 ? "Already first in this act" : "Already last in this act");
      [c.n, list[j].n] = [list[j].n, c.n];
    } else {
      const ai = acts.indexOf(c.act) + (key === "ArrowUp" ? -1 : 1);
      if (!acts[ai]) return UI.toast(ai < 0 ? "Already in the first act" : "Already in the last act");
      c.act = acts[ai];
      c.n = key === "ArrowUp" ? 1e9 : -1;
    }
    renumber();
    W.App.save();
    W.Plan.refresh();
    UI.toast(`Now Ch ${c.n} · ${DATA.acts.find((a) => a.id === c.act).title}`);
  }
  function createTemplate(id) {
    const t = DATA.templates.find((x) => x.id === id);
    if (id === "snowflake") {
      D.getElementById("snowflakeWizard").hidden = false;
      snowGo(snow.i);
      return D.getElementById("snowText")?.focus();
    }
    D.getElementById("templateModal")?.classList.remove("open");
    UI.toast(`Prototype: would start a new book with ${t?.beats.length || 0} ${t?.name || ""} beats as placeholder chapters`);
  }
  const snow = { i: 0, text: [] };
  function snowGo(i) {
    const ta = D.getElementById("snowText");
    if (ta) snow.text[snow.i] = ta.value;
    snow.i = Math.max(0, Math.min(SNOW.length - 1, i));
    if (ta) {
      ta.value = snow.text[snow.i] || "";
      ta.placeholder = `${SNOW[snow.i]}…`;
    }
    D.getElementById("snowStepName").textContent = `Step ${snow.i + 1} · ${SNOW[snow.i]}`;
    D.querySelectorAll("[data-snow-step]").forEach((b, k) => {
      b.classList.toggle("active", k === snow.i);
      b.setAttribute("aria-pressed", String(k === snow.i));
    });
    const next = D.querySelector('[data-snow-nav="1"]');
    if (next) next.textContent = snow.i === SNOW.length - 1 ? "Finish" : "Next";
  }
  function snowNav(d) {
    if (d > 0 && snow.i === SNOW.length - 1) {
      snowGo(snow.i);
      D.getElementById("templateModal")?.classList.remove("open");
      return UI.toast("Prototype: would build the outline from your Snowflake steps");
    }
    snowGo(snow.i + d);
  }
  function toggleThread(b) {
    const [cid, tid] = b.dataset.threadToggle.split(":"),
      c = ch(cid),
      list = c.threads || [];
    c.threads = list.includes(tid) ? list.filter((x) => x !== tid) : [...list, tid];
    b.setAttribute("aria-pressed", String(c.threads.includes(tid)));
    W.App.save();
    W.Plan.refresh();
  }
  // AI suggests; the writer decides whether it replaces their summary.
  function summarize(cid) {
    const c = ch(cid),
      beats = (c.beats || []).map((b) => b[0].trim()).filter(Boolean),
      text = beats.length
        ? beats.join("; ").replace(/^./, (m) => m.toUpperCase()) + "."
        : `${c.pov || "The narrator"} pushes the story toward ${c.beat || "its next turn"}${c.place ? ` at ${c.place}` : ""}.`,
      field = D.querySelector(`#drawer [data-edit-ch="${cid}:summary"]`)?.closest(".field");
    if (!field) return;
    let box = D.getElementById("sumPreview");
    if (!box) {
      field.insertAdjacentHTML("beforeend", `<div id="sumPreview" class="draft-preview" role="group" aria-label="AI summary suggestion"></div>`);
      box = D.getElementById("sumPreview");
    }
    box.dataset.text = text;
    box.innerHTML = `<p>${UI.esc(text)}</p><p><button class="pill-btn active" data-sum-use="${cid}">Use this</button> <button class="small-btn" data-sum-dismiss>Dismiss</button></p>`;
    box.querySelector("button").focus();
  }
  function useSummary(cid) {
    const box = D.getElementById("sumPreview"),
      c = ch(cid),
      ta = D.querySelector(`#drawer [data-edit-ch="${cid}:summary"]`);
    if (!box || !c) return;
    c.summary = box.dataset.text;
    if (ta) ta.value = c.summary;
    box.remove();
    W.App.save();
    W.Plan.refresh();
    ta?.focus();
    UI.toast("Summary updated");
  }
  function toggleCell(b) {
    const c = ch(b.dataset.chapterId),
      id = b.dataset.id,
      key = b.dataset.kind === "thread" ? "threads" : "chars",
      list = c[key] || [];
    c[key] = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
    W.App.save();
    W.Plan.refresh();
  }
  // Refocus target after a re-render: the same data-* attributes find the replacement element.
  function focusKey(el) {
    const a = [...el.attributes].filter((x) => x.name.startsWith("data-"));
    return a.length ? a.map((x) => `[${x.name}="${CSS.escape(x.value)}"]`).join("") : null;
  }

  W.Plan = {
    render() {
      return `<section class="view plan-view${viewClass()}">${toolbar()}${viewHTML()}${templatesModal()}<div id="drawerHost"></div></section>`;
    },
    // Re-render only the view body; the toolbar, open menus and drawer keep their state and focus.
    refresh(keepScroll = true) {
      const old = D.querySelector(".plan-view > .content");
      if (!old) return;
      const inner = old.firstElementChild,
        pos = keepScroll ? [old.scrollTop, old.scrollLeft, inner?.scrollTop, inner?.scrollLeft] : [0, 0, 0, 0],
        key = old.contains(D.activeElement) ? focusKey(D.activeElement) : null;
      old.outerHTML = viewHTML();
      const now = D.querySelector(".plan-view > .content"),
        ni = now.firstElementChild;
      [now.scrollTop, now.scrollLeft] = pos;
      if (ni) [ni.scrollTop, ni.scrollLeft] = [pos[2] || 0, pos[3] || 0];
      if (key) now.querySelector(key)?.focus({ preventScroll: true });
      setTimeout(() => this.layoutRibbon(), 0);
    },
    layoutRibbon() {
      const ribbon = D.querySelector(".overlay-ribbon");
      if (!ribbon) return;
      const labels = [...ribbon.querySelectorAll(".marker-label")];
      labels.forEach((l) => {
        l.style.display = l.closest(".marker").classList.contains("unmapped") ? "none" : "block";
        l.style.top = "";
        l.style.left = "";
        l.style.right = "";
        l.style.transform = "";
      });
      const rect = ribbon.getBoundingClientRect();
      const rows = [[], [], []];
      const visible = labels
        .filter((l) => getComputedStyle(l).display !== "none")
        .sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
      visible.forEach((label) => {
        let placed = false;
        for (let i = 0; i < 3 && !placed; i++) {
          label.style.top = `${-72 + i * 24}px`;
          const r = label.getBoundingClientRect();
          const shiftLeft = Math.max(0, rect.left + 8 - r.left);
          const shiftRight = Math.max(0, r.right - rect.right + 8);
          if (shiftLeft) label.style.transform = `translateX(calc(-50% + ${shiftLeft}px))`;
          if (shiftRight) label.style.transform = `translateX(calc(-50% - ${shiftRight}px))`;
          const nr = label.getBoundingClientRect();
          if (nr.top >= rect.top + 4 && nr.bottom <= rect.bottom - 4 && !rows[i].some((p) => !(nr.left >= p.right + 6 || nr.right + 6 <= p.left))) {
            rows[i].push(nr);
            placed = true;
          }
        }
        if (!placed) label.style.display = "none";
      });
    },
    openDrawer(id) {
      const c = ch(id),
        host = D.getElementById("drawerHost");
      if (!c || !host) return;
      host.innerHTML = drawer(c);
      D.getElementById("drawer").classList.add("open");
      W.Write?.autogrow?.();
    },
    beatRows(c, mode = "drawer") {
      return `<div class="beat-list" data-beats-for="${c.id}" data-mode="${mode}">${beatRowsHTML(c, mode)}</div><button class="small-btn add-beat" data-add-beat="${c.id}">${UI.icon("plus")} Beat</button>`;
    },
    refreshBeats(cid, focusIdx) {
      const c = ch(cid);
      if (!c) return;
      D.querySelectorAll(`.beat-list[data-beats-for="${cid}"]`).forEach((l) => (l.innerHTML = beatRowsHTML(c, l.dataset.mode)));
      if (focusIdx != null) D.querySelector(`.beat-list[data-beats-for="${cid}"] [data-beat-text="${cid}:${focusIdx}"]`)?.focus();
    },
    addBeat(cid, text = "", focus = true, at) {
      const c = ch(cid);
      if (!c) return;
      c.beats = c.beats || [];
      const i = at == null ? c.beats.length : Math.max(0, Math.min(c.beats.length, at));
      c.beats.splice(i, 0, [text, false]);
      W.App.save();
      this.refreshBeats(cid, focus ? i : null);
      if (S().screen === "plan") this.refresh();
      return i;
    },
    removeBeat(cid, i) {
      const c = ch(cid);
      if (!c?.beats?.[i]) return;
      const [gone] = c.beats.splice(i, 1);
      W.App.save();
      this.refreshBeats(cid);
      const list = D.querySelector(`.beat-list[data-beats-for="${cid}"]`);
      (list?.querySelector(`[data-beat-text="${cid}:${Math.min(i, c.beats.length - 1)}"]`) || list?.nextElementSibling)?.focus();
      if (S().screen === "plan") this.refresh();
      UI.toast(`Removed beat “${gone[0] || "untitled"}”`);
    },
    // Returns the new chapter without rendering; callers decide where to show it.
    addChapter(actId) {
      const chs = S().chapters,
        num = Math.max(0, ...chs.map((c) => +String(c.id).replace(/\D/g, "") || 0)) + 1,
        id = "ch" + num,
        act = DATA.acts.some((a) => a.id === actId) ? actId : DATA.acts[DATA.acts.length - 1].id;
      const c = { id, act, n: 1e9, title: "Untitled chapter", status: "Idea", words: 0, target: 3000, pov: "Mara", beat: "", time: "", place: "", labels: [], threads: [], chars: [], summary: "", notes: "", beats: [], scenes: [{ id: id + "s1", title: "Scene 1", pov: "Mara", prose: "" }] };
      chs.push(c);
      renumber();
      W.App.save();
      return c;
    },
    renumber,
    hit,
    wire(root) {
      root.addEventListener("keydown", (e) => {
        const card = e.target.matches?.("article.chapter-card[data-chapter]") ? e.target : null;
        if (!card) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          this.openDrawer(card.dataset.chapter);
        } else if ((e.altKey || e.ctrlKey) && /^Arrow(Left|Right|Up|Down)$/.test(e.key)) {
          e.preventDefault();
          moveCard(card.dataset.chapter, e.key);
        }
      });
      root.addEventListener("click", (e) => {
        const q = (s) => e.target.closest(s);
        let b;
        if ((b = q("[data-plan-view]"))) return setView(b.dataset.planView);
        if ((b = q("[data-timeline-order]"))) {
          S().timelineOrder = b.dataset.timelineOrder;
          W.App.save();
          return this.refresh();
        }
        if ((b = q("[data-plan-display]"))) return toggleDisplay(b);
        if (q("[data-plan-filter-clear]")) return setFilter(null);
        if ((b = q("[data-beat-ch]"))) return pulse(b.dataset.beatCh);
        if ((b = q("[data-beat-name]"))) return UI.toast(`“${b.dataset.beatName}” isn't mapped · set a chapter's Template beat in its drawer`);
        if ((b = q("[data-toggle-overlay]"))) {
          const on = (S().settings.overlay = !S().settings.overlay);
          W.App.save();
          b.classList.toggle("active", on);
          b.setAttribute("aria-pressed", String(on));
          return this.refresh();
        }
        if ((b = q("[data-add-chapter]"))) return addFromPlan(b.dataset.addChapter);
        if ((b = q("[data-create-template]"))) return createTemplate(b.dataset.createTemplate);
        if ((b = q("[data-snow-step]"))) return snowGo(+b.dataset.snowStep);
        if ((b = q("[data-snow-nav]"))) return snowNav(+b.dataset.snowNav);
        if ((b = q("[data-thread-toggle]"))) return toggleThread(b);
        if ((b = q("[data-sum-use]"))) return useSummary(b.dataset.sumUse);
        if (q("[data-sum-dismiss]")) {
          D.getElementById("sumPreview")?.remove();
          return D.querySelector("#drawer [data-summarize]")?.focus();
        }
        if ((b = q("[data-summarize]"))) return summarize(b.dataset.summarize);
        if ((b = q("[data-write-chapter]"))) return W.Write.openChapter(b.dataset.writeChapter);
        if ((b = q("[data-matrix-cell]"))) return toggleCell(b);
        if ((b = q("[data-chapter],[data-open-chapter]"))) return this.openDrawer(b.dataset.chapter || b.dataset.openChapter);
      });
      root.addEventListener("change", (e) => {
        const t = e.target;
        if (t.matches("[data-template]")) {
          S().template = t.value;
          W.App.save();
          this.refresh();
          return UI.toast(`Structure: ${tpl().name}`);
        }
        if (t.matches("[data-plan-filter]")) setFilter(t.dataset.planFilter, t.value);
      });
      root.addEventListener("input", (e) => {
        const t = e.target;
        if (!t.matches?.("[data-summary]")) return;
        const c = ch(t.dataset.summary);
        if (!c) return;
        c.summary = t.innerText.trim();
        W.App.save();
      });
      let dragId = null;
      const clearMarks = () => D.querySelectorAll(".drop-before,.drop-into").forEach((x) => x.classList.remove("drop-before", "drop-into"));
      root.addEventListener("dragstart", (e) => {
        const c = e.target.closest?.("[data-chapter]");
        if (!c) return;
        dragId = c.dataset.chapter;
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", dragId);
        c.classList.add("dragging");
      });
      root.addEventListener("dragover", (e) => {
        const row = e.target.closest?.(".act-row");
        if (!row || !dragId) return;
        e.preventDefault();
        const over = e.target.closest("[data-chapter]");
        clearMarks();
        if (over && over.dataset.chapter !== dragId) over.classList.add("drop-before");
        else if (!over) row.classList.add("drop-into");
      });
      root.addEventListener("dragend", () => {
        clearMarks();
        D.querySelector(".dragging")?.classList.remove("dragging");
        dragId = null;
      });
      // Dropping on a card puts the dragged chapter before it; dropping on empty act space appends.
      root.addEventListener("drop", (e) => {
        const row = e.target.closest?.(".act-row");
        if (!row || !dragId) return;
        e.preventDefault();
        const c = ch(dragId),
          over = e.target.closest("[data-chapter]"),
          target = over && over.dataset.chapter !== dragId ? ch(over.dataset.chapter) : null;
        c.act = row.dataset.act;
        c.n = target ? target.n - 0.5 : 1e9;
        renumber();
        W.App.save();
        clearMarks();
        dragId = null;
        this.refresh();
        UI.toast(`Moved · now Ch ${c.n}`);
      });
    },
  };
})();
