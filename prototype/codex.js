(function () {
  "use strict";
  const W = window,
    D = document,
    UI = W.UI,
    DATA = W.BOOKBOOKBOOK_DATA;
  const S = () => W.App.state;
  const BASE_TYPES = ["Characters", "Locations", "Objects", "Factions", "Lore", "Events", "Plot threads", "Themes"];
  const CONTEXT = {
    Always: "Sent with every AI request in this book.",
    "When mentioned": "Sent when the prose or your prompt mentions it.",
    Never: "Never sent to AI.",
  };
  const LONG = new Set(["Personality", "Wound", "Voice", "Voice & speech", "History", "Question", "Secret", "Consequence", "Meaning"]);
  const TYPE_FIELDS = {
    Characters: ["Role", "Goal", "Voice"],
    Locations: ["Description", "Mood"],
    Objects: ["Description"],
    Factions: ["Power", "Secret"],
    Lore: ["Meaning"],
    Events: ["When", "Where", "Consequence"],
    "Plot threads": ["Question", "Status"],
    Themes: ["Question", "Image"],
  };
  const COLORS = ["#6B7FA6", "#C98A2B", "#C2557A", "#2A8C8C", "#2E4A7D", "#7A7366"];
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;
  const ov = () => (S().codexOverrides = S().codexOverrides || {});
  const types = () => [...BASE_TYPES, ...(S().codexTypes || [])];

  // Sample entries stay read-only in DATA; edits and new entries live in state.codexOverrides.
  function all() {
    const o = ov();
    return [
      ...DATA.codex.map((e) => (o[e.id] ? { ...e, ...o[e.id], fields: { ...e.fields, ...(o[e.id].fields || {}) } } : e)),
      ...Object.values(o).filter((x) => x && x._new),
    ];
  }
  const get = (id) => all().find((e) => e.id === id);
  function patch(id, props) {
    const o = ov(),
      cur = (o[id] = o[id] || {});
    Object.entries(props).forEach(([k, v]) => (cur[k] = k === "fields" ? { ...(cur.fields || {}), ...v } : v));
    W.App.save();
  }
  function make(type, name, notes = "") {
    const id = "cx" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      e = {
        _new: true,
        id,
        type,
        name,
        aliases: [],
        tags: [],
        context: "When mentioned",
        color: COLORS[all().length % COLORS.length],
        fields: Object.fromEntries((TYPE_FIELDS[type] || []).map((f) => [f, ""])),
        notes,
      };
    ov()[id] = e;
    W.App.save();
    return e;
  }
  const searching = () => !!((W.Codex.q || "").trim() || W.Codex.tag);
  function visible() {
    const q = (W.Codex.q || "").trim().toLowerCase(),
      tag = W.Codex.tag;
    return all().filter((e) => {
      if (tag && !(e.tags || []).includes(tag)) return false;
      if (q) return [e.name, e.type, ...(e.aliases || []), ...(e.tags || []), e.notes || "", ...Object.values(e.fields || {})].join(" ").toLowerCase().includes(q);
      return tag ? true : e.type === S().codexType;
    });
  }
  function current() {
    const st = S(),
      e = get(st.codexEntry) || all().find((x) => x.type === st.codexType) || null;
    st.codexEntry = e ? e.id : null;
    return e;
  }
  function mentions(e) {
    const mc = W.Write?.mentionCounts;
    if (!mc) return [];
    return [...S().chapters]
      .sort((a, b) => a.n - b.n)
      .map((c) => [c, mc(c)[e.id] || 0])
      .filter((x) => x[1]);
  }

  function sideHTML() {
    const st = S(),
      list = all(),
      srch = searching();
    return `<h2>Codex</h2><nav aria-label="Entry types">${types()
      .map((t) => {
        const on = st.codexType === t && !srch;
        return `<button class="type-btn${on ? " active" : ""}" data-codex-type="${UI.esc(t)}"${on ? ' aria-current="true"' : ""}><span>${UI.esc(t)}</span><span>${list.filter((e) => e.type === t).length}</span></button>`;
      })
      .join("")}</nav>${
      W.Codex.addingType
        ? `<div class="inline-add"><input data-cx-type-name aria-label="New type name" placeholder="e.g. Ships"><button class="small-btn" data-cx-type-add>Add</button></div>`
        : `<button class="small-btn side-new" data-cx-new-type>${UI.icon("plus")} New type</button>`
    }`;
  }
  function listHead() {
    const tags = [...new Set(all().flatMap((e) => e.tags || []))].sort((a, b) => a.localeCompare(b));
    return `<input type="search" class="small-btn codex-search" data-cx-search aria-label="Search codex" placeholder="Search codex" value="${UI.esc(W.Codex.q || "")}"><select class="small-btn codex-tag" data-cx-tag aria-label="Filter by tag"><option value="">All tags</option>${tags
      .map((t) => `<option${t === W.Codex.tag ? " selected" : ""}>${UI.esc(t)}</option>`)
      .join("")}</select><button class="small-btn codex-new" data-codex-new>${UI.icon("plus")} New entry</button><p class="sr-only" id="codexCount" role="status"></p>`;
  }
  function listHTML() {
    const rows = visible(),
      sel = S().codexEntry,
      srch = searching(),
      type = S().codexType;
    if (!rows.length)
      return srch
        ? `<p class="muted codex-empty">No entries match.</p>`
        : `<div class="codex-empty"><p class="muted">No ${UI.esc(type.toLowerCase())} yet.</p><button class="small-btn" data-codex-new>${UI.icon("plus")} New ${UI.esc(UI.singular(type).toLowerCase())}</button></div>`;
    return rows
      .map((e) => {
        const on = e.id === sel,
          sub = [srch ? UI.singular(e.type) : "", (e.aliases || []).join(", ")].filter(Boolean).join(" · ");
        return `<button class="codex-row${on ? " active" : ""}"${on ? ' aria-current="true"' : ""} data-codex-entry="${e.id}"><span class="portrait mini" style="background:${e.color}" aria-hidden="true">${UI.esc(UI.initials(UI.cap(e.name)))}</span><span class="codex-row-text"><b>${UI.esc(UI.cap(e.name))}</b>${sub ? `<small>${UI.esc(sub)}</small>` : ""}<span class="tag">${UI.esc(e.context)}</span></span></button>`;
      })
      .join("");
  }
  function detailHTML(e) {
    if (!e) return `<div class="codex-empty"><p class="muted">Nothing here yet.</p><button class="small-btn" data-codex-new>${UI.icon("plus")} New entry</button></div>`;
    const hits = mentions(e),
      field = ([k, v]) =>
        `<label class="field${k === "Voice" ? " full-field" : ""}"><span>${UI.esc(k)}</span>${
          LONG.has(k) || String(v).length > 44 ? `<textarea rows="${k === "Voice" ? 4 : 2}" data-cx-field="${UI.esc(k)}">${UI.esc(v)}</textarea>` : `<input data-cx-field="${UI.esc(k)}" value="${UI.esc(v)}">`
        }</label>`,
      phase = (title, sample, hint) => `<h3>${title} <span class="phase">Phase 2</span></h3>${e.id === "mara" ? `<p>${sample}</p>` : `<p class="muted">${hint}</p>`}`;
    return `<div class="entry-head"><span class="portrait" style="background:${e.color}" aria-hidden="true">${UI.esc(UI.initials(UI.cap(e.name)))}</span><div class="entry-title"><input class="entry-name" data-cx-name value="${UI.esc(e.name)}" aria-label="Entry name" spellcheck="false"><p>${UI.esc(UI.singular(e.type))}${(e.tags || []).map((t) => ` <span class="tag">${UI.esc(t)}</span>`).join("")}</p></div></div>
      <h3 id="cxAliasH">Aliases</h3>
      <div class="aliases" role="group" aria-labelledby="cxAliasH">${(e.aliases || [])
        .map((a, i) => `<button class="tag alias" data-cx-alias-remove="${i}" aria-label="Remove alias ${UI.esc(a)}" title="Remove alias">${UI.esc(a)}</button>`)
        .join("")}<span class="inline-add"><input data-cx-alias aria-label="New alias" placeholder="Add alias"><button class="small-btn" data-cx-alias-add>${UI.icon("plus")} Add</button></span></div>
      <h3 id="cxCtxH">AI context</h3>
      <div class="seg" role="group" aria-labelledby="cxCtxH">${Object.keys(CONTEXT)
        .map((x) => `<button data-cx-context="${x}" aria-pressed="${e.context === x}" class="${e.context === x ? "active" : ""}">${x}</button>`)
        .join("")}</div>
      <p class="muted cx-hint" id="cxCtxHint">${CONTEXT[e.context] || ""}</p>
      <h3>Details</h3>
      <div class="grid cols">${Object.entries(e.fields || {}).map(field).join("") || `<p class="muted">No details yet.</p>`}</div>
      <div class="inline-add"><input data-cx-newfield aria-label="New field name" placeholder="New field, e.g. Fear"><button class="small-btn" data-cx-newfield-add>${UI.icon("plus")} Add field</button></div>
      <div class="field"><span class="label-row"><label for="cxNotes">Notes</label><button class="icon-btn mini" data-inline-mic="codex" aria-label="Dictate codex notes" title="Dictate codex notes">${UI.icon("mic")}</button></span><textarea id="cxNotes" data-cx-notes rows="5">${UI.esc(e.notes || "")}</textarea></div>
      <h3>Appears in</h3>
      <div class="aliases">${
        hits.map(([c, n]) => `<button class="tag" data-write-ch="${c.id}">Ch ${c.n} · ${UI.esc(c.title)} · ${plural(n, "mention")}</button>`).join("") ||
        `<span class="muted">Not mentioned in the manuscript yet.</span>`
      }</div>
      ${
        e.type === "Characters"
          ? phase("Relationships", `<span class="tag">Jonas — brother</span> <span class="tag">Elias — old flame</span>`, "Link characters with a label, like “brother” or “old flame”.") +
            phase("Progressions", `<span class="tag">From Ch 8: knows the ledger is code</span>`, "Track how this entry changes from a chosen chapter onward.")
          : ""
      }`;
  }

  W.Codex = {
    q: "",
    tag: "",
    addingType: false,
    all,
    render() {
      const e = current();
      if (searching() && e && !visible().some((x) => x.id === e.id)) this.q = this.tag = "";
      return `<section class="codex-layout"><aside class="side" id="codexSide" aria-label="Codex types">${sideHTML()}</aside><aside class="list" aria-label="Codex entries">${listHead()}<div id="codexList">${listHTML()}</div></aside><div class="entry" id="codexEntry" data-id="${e ? e.id : ""}">${detailHTML(e)}</div></section>`;
    },
    refresh(parts, focusSel) {
      if (parts.includes("side")) {
        const s = D.getElementById("codexSide");
        if (s) s.innerHTML = sideHTML();
      }
      if (parts.includes("list")) {
        const l = D.getElementById("codexList");
        if (l) l.innerHTML = listHTML();
      }
      if (parts.includes("entry")) {
        const d = D.getElementById("codexEntry");
        if (d) {
          const e = current(),
            same = d.dataset.id === (e ? e.id : ""),
            top = d.scrollTop;
          d.innerHTML = detailHTML(e);
          d.dataset.id = e ? e.id : "";
          d.scrollTop = same ? top : 0;
        }
      }
      if (focusSel) D.querySelector(focusSel)?.focus();
    },
    announce() {
      const s = D.getElementById("codexCount");
      if (s) s.textContent = searching() ? `${plural(visible().length, "entry", "entries")} found` : "";
    },
    clearSearch() {
      this.q = this.tag = "";
      D.querySelectorAll("[data-cx-search],[data-cx-tag]").forEach((x) => (x.value = ""));
    },
    pickType(t) {
      const st = S();
      st.codexType = t;
      st.codexEntry = all().find((x) => x.type === t)?.id || null;
      this.clearSearch();
      W.App.save();
      this.refresh(["side", "list", "entry"], `[data-codex-type="${CSS.escape(t)}"]`);
      this.announce();
    },
    pick(id) {
      const e = get(id);
      if (!e) return;
      S().codexEntry = id;
      S().codexType = e.type;
      W.App.save();
      this.refresh(["side", "list", "entry"], `[data-codex-entry="${CSS.escape(id)}"]`);
    },
    create() {
      const st = S(),
        type = st.codexType || "Characters",
        e = make(type, `New ${UI.singular(type).toLowerCase()}`);
      st.codexEntry = e.id;
      this.clearSearch();
      W.App.save();
      this.refresh(["side", "list", "entry"]);
      const name = D.querySelector("[data-cx-name]");
      name?.focus();
      name?.select();
      UI.toast(`New ${UI.singular(type).toLowerCase()} added · give it a name`);
    },
    addType() {
      const inp = D.querySelector("[data-cx-type-name]"),
        name = (inp?.value || "").trim().replace(/\s+/g, " ");
      if (!inp) return;
      if (!name) {
        inp.focus();
        return UI.toast("Name the new type first");
      }
      if (types().some((t) => t.toLowerCase() === name.toLowerCase())) {
        inp.select();
        return UI.toast(`“${name}” already exists`);
      }
      const st = S();
      (st.codexTypes = st.codexTypes || []).push(name);
      this.addingType = false;
      st.codexType = name;
      st.codexEntry = null;
      this.clearSearch();
      W.App.save();
      this.refresh(["side", "list", "entry"], "#codexList [data-codex-new]");
      UI.toast(`Added the “${name}” type`);
    },
    setContext(x) {
      const id = S().codexEntry;
      if (!id || !CONTEXT[x]) return;
      patch(id, { context: x });
      D.querySelectorAll("[data-cx-context]").forEach((b) => {
        const on = b.dataset.cxContext === x;
        b.classList.toggle("active", on);
        b.setAttribute("aria-pressed", String(on));
      });
      const h = D.getElementById("cxCtxHint");
      if (h) h.textContent = CONTEXT[x];
      this.refresh(["list"]);
      UI.toast(`AI context: ${x.toLowerCase()}`);
    },
    addAlias() {
      const id = S().codexEntry,
        e = get(id),
        inp = D.querySelector("[data-cx-alias]"),
        v = (inp?.value || "").trim().replace(/\s+/g, " ");
      if (!e || !inp) return;
      if (!v) {
        inp.focus();
        return UI.toast("Type an alias first");
      }
      if ([e.name, ...(e.aliases || [])].some((a) => a.toLowerCase() === v.toLowerCase())) {
        inp.select();
        return UI.toast(`“${v}” is already listed`);
      }
      patch(id, { aliases: [...(e.aliases || []), v] });
      this.refresh(["list", "entry"], "[data-cx-alias]");
      UI.toast(`Added alias “${v}”`);
    },
    removeAlias(i) {
      const id = S().codexEntry,
        e = get(id);
      if (!e?.aliases?.[i]) return;
      const gone = e.aliases[i],
        next = e.aliases.filter((_, k) => k !== i);
      patch(id, { aliases: next });
      this.refresh(["list", "entry"], next.length ? `[data-cx-alias-remove="${Math.min(i, next.length - 1)}"]` : "[data-cx-alias]");
      UI.toast(`Removed alias “${gone}”`);
    },
    addField() {
      const id = S().codexEntry,
        e = get(id),
        inp = D.querySelector("[data-cx-newfield]"),
        v = (inp?.value || "").trim().replace(/\s+/g, " ");
      if (!e || !inp) return;
      if (!v) {
        inp.focus();
        return UI.toast("Name the field first");
      }
      if (Object.keys(e.fields || {}).some((k) => k.toLowerCase() === v.toLowerCase())) {
        inp.select();
        return UI.toast(`“${v}” already exists`);
      }
      patch(id, { fields: { [v]: "" } });
      this.refresh(["entry"], `[data-cx-field="${CSS.escape(v)}"]`);
    },
    // Inbox "Turn into → Codex note": file under the first entry the note names, or start a new Lore entry.
    fromNote(text) {
      const hit = all().find((e) =>
        [e.name, ...(e.aliases || [])].some((a) => {
          const w = String(a).replace(/^(the|a|an)\s+/i, "").trim();
          return w.length > 2 && new RegExp(`\\b${escRe(w)}\\b`, "i").test(text);
        }),
      );
      if (hit) {
        patch(hit.id, { notes: (hit.notes ? hit.notes.trimEnd() + "\n\n" : "") + text });
        return { entry: get(hit.id), created: false };
      }
      const name = text.split(/\s+/).slice(0, 4).join(" ").replace(/[.,;:!?]+$/, "");
      return { entry: make("Lore", name, text), created: true };
    },
    wire(root) {
      root.addEventListener("click", (e) => {
        const q = (s) => e.target.closest(s);
        let b;
        if ((b = q("[data-codex-type]"))) return this.pickType(b.dataset.codexType);
        if ((b = q("[data-codex-entry]"))) return this.pick(b.dataset.codexEntry);
        if (q("[data-codex-new]")) return this.create();
        if (q("[data-cx-new-type]")) {
          this.addingType = true;
          return this.refresh(["side"], "[data-cx-type-name]");
        }
        if (q("[data-cx-type-add]")) return this.addType();
        if ((b = q("[data-cx-context]"))) return this.setContext(b.dataset.cxContext);
        if (q("[data-cx-alias-add]")) return this.addAlias();
        if ((b = q("[data-cx-alias-remove]"))) return this.removeAlias(+b.dataset.cxAliasRemove);
        if (q("[data-cx-newfield-add]")) return this.addField();
        if ((b = q("[data-write-ch]"))) return W.Write.openChapter(b.dataset.writeCh);
      });
      root.addEventListener("input", (e) => {
        const t = e.target,
          id = S().codexEntry;
        if (t.matches("[data-cx-search]")) {
          this.q = t.value;
          this.refresh(["side", "list"]);
          return this.announce();
        }
        if (!id) return;
        if (t.matches("[data-cx-name]")) {
          patch(id, { name: t.value });
          return this.refresh(["list"]);
        }
        if (t.matches("[data-cx-field]")) return patch(id, { fields: { [t.dataset.cxField]: t.value } });
        if (t.matches("[data-cx-notes]")) patch(id, { notes: t.value });
      });
      root.addEventListener("change", (e) => {
        const t = e.target;
        if (t.matches("[data-cx-tag]")) {
          this.tag = t.value;
          this.refresh(["side", "list"]);
          return this.announce();
        }
        if (t.matches("[data-cx-name]") && S().codexEntry) {
          const v = t.value.trim() || "Untitled";
          if (v !== t.value) t.value = v;
          patch(S().codexEntry, { name: v });
          this.refresh(["list"]);
          const p = D.querySelector(".entry-head .portrait");
          if (p) p.textContent = UI.initials(UI.cap(v));
        }
      });
      root.addEventListener("keydown", (e) => {
        const t = e.target;
        if (e.key === "Escape" && t.matches("[data-cx-type-name]")) {
          this.addingType = false;
          return this.refresh(["side"], "[data-cx-new-type]");
        }
        if (e.key !== "Enter" || e.isComposing) return;
        if (t.matches("[data-cx-alias]")) e.preventDefault(), this.addAlias();
        else if (t.matches("[data-cx-newfield]")) e.preventDefault(), this.addField();
        else if (t.matches("[data-cx-type-name]")) e.preventDefault(), this.addType();
      });
    },
  };
})();
