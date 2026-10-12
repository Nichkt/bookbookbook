(function () {
  "use strict";
  const W = window,
    D = document,
    UI = W.UI;
  const S = () => W.App.state;
  const WORD_MS = 140;
  // Prototype speech: sample phrases stream in word by word, the way live transcription does.
  const MOCK = {
    capture: "Mara should ask Agnes about the bell rope new line Jonas knows the Guild mark period",
    prose: "The lamp room smelled of paraffin comma salt comma and old wool period",
    beats: "Mara finds the Lamp Oath mark in the ledger new beat Agnes admits she kept the bell receipt",
    summary: "Mara presses Agnes about the altered ledger and learns the bell receipt survived the storm period",
    notes: "Check the tide tables for the night of the storm period",
    codex: "First seen in chapter three comma keep the details consistent period",
  };
  const LABEL = { prose: "at the cursor", beats: "new beats", summary: "summary", notes: "notes", codex: "codex notes", comment: "comment" };
  const engineName = () => (S().voiceEngine === "cloud" ? "Cloud" : "On-device");
  const privacyLine = () =>
    S().voiceEngine === "cloud" ? "Cloud speech: audio is deleted right after transcription." : "On-device speech: audio never leaves this computer.";
  const nowLabel = () => "Today " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const chapters = () => [...S().chapters].sort((a, b) => a.n - b.n);
  const words = (t) => String(t).split(/\s+/).filter(Boolean).length;
  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
  function target() {
    const st = S();
    return W.App.chapter(st.inboxTarget) || W.App.chapter(st.activeChapter) || chapters()[0];
  }
  // Mock "AI clean-up": drop filler words, tidy spacing, capitalise sentences, end with a full stop.
  function cleanText(t) {
    return String(t)
      .replace(/\b(?:um+|uh+|erm|you know|i mean)\b,?\s*/gi, "")
      .replace(/\s{2,}/g, " ")
      .replace(/\s+([,.!?;:])/g, "$1")
      .replace(/^[\s,;:]+/, "")
      .replace(/(^|[.!?]\s+)([a-z])/g, (m, a, b) => a + b.toUpperCase())
      .replace(/([^.!?…\s])\s*$/, "$1.")
      .trim();
  }
  const sentences = (t) => (t.match(/[^.!?]+[.!?]+/g) || [t]).map((s) => s.trim()).filter(Boolean);

  function noteHTML(n, c) {
    const id = UI.esc(n.id);
    return `<article class="note-card" data-note="${id}" aria-labelledby="nt-${id}">
      <h3 id="nt-${id}">${UI.esc(n.time)}</h3>
      <p class="note-text">${UI.esc(n.text)}</p>
      <small class="muted">${UI.esc(n.origin)}${n.raw != null ? " · cleaned up" : ""}</small>
      ${n.sent?.length ? `<p class="note-sent">${n.sent.map((s) => `<span class="tag">→ ${UI.esc(s)}</span>`).join(" ")}</p>` : ""}
      <div class="note-actions">
        <button class="small-btn" data-clean="${id}">${n.raw != null ? "Undo clean-up" : "Clean up"}</button>
        <div class="menu-wrap">
          <button class="small-btn" data-menu-toggle="turn-${id}" aria-haspopup="menu" aria-expanded="false">Turn into… ▾</button>
          <div class="menu-pop" data-menu-pop="turn-${id}" role="menu" aria-label="Turn note into">
            <button role="menuitem" data-turn="${id}:beats">Beats in Chapter ${c.n}</button>
            <button role="menuitem" data-turn="${id}:summary">Chapter ${c.n} summary</button>
            <button role="menuitem" data-turn="${id}:codex">Codex note</button>
          </div>
        </div>
        <button class="small-btn" data-file="${id}" title="Add to the Chapter ${c.n} notes">File to notes</button>
        <div class="menu-wrap">
          <button class="icon-btn mini" data-menu-toggle="note-${id}" aria-haspopup="menu" aria-expanded="false" aria-label="More actions for the ${UI.esc(n.time)} note">${UI.icon("more")}</button>
          <div class="menu-pop menu-pop-right" data-menu-pop="note-${id}" role="menu" aria-label="Note actions">
            <button role="menuitem" data-copy-note="${id}">Copy text</button>
            <button role="menuitem" data-delete-note="${id}">Delete note</button>
          </div>
        </div>
      </div>
    </article>`;
  }
  function listHTML() {
    const c = target();
    return S().inbox.length
      ? S().inbox.map((n) => noteHTML(n, c)).join("")
      : `<div class="inbox-empty"><h3>Inbox zero</h3><p class="muted">Press Record, or the mic in the top bar, to catch a thought before it slips away.</p></div>`;
  }
  function captureHTML() {
    const st = S(),
      mode = st.voiceMode === "memo" ? "memo" : "live",
      cmds = st.settings.voiceCommands !== false;
    return `<aside class="capture" aria-labelledby="capTitle">
      <h2 id="capTitle">Quick capture</h2>
      <div class="seg mode-seg" role="group" aria-label="Capture mode">${[
        ["live", "Live dictation"],
        ["memo", "Voice memo"],
      ]
        .map(([k, l]) => `<button data-voice-mode="${k}" aria-pressed="${mode === k}" class="${mode === k ? "active" : ""}">${l}</button>`)
        .join("")}</div>
      ${W.App.engineSeg()}
      <button class="record" data-record>Record</button>
      <div class="levels" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
      <p class="cap-status" id="capStatus" role="status">${mode === "memo" ? "Records now, transcribes when you stop." : "Words appear as you speak."}</p>
      <p class="chip cap-hint">${cmds ? "Say “new line”, “new beat”, “comma”, “period”" : "Voice commands are off · Settings › Speech"}</p>
      <label class="field"><span>Transcript</span><textarea id="voiceText" rows="6" placeholder="Speak, or type a quick thought…">${UI.esc(st.voiceDraft || "")}</textarea></label>
      <p class="cap-actions"><button class="pill-btn active" data-save-note>Save to Inbox</button> <button class="small-btn" data-discard-note>Discard</button></p>
      <p class="saved" id="capPrivacy">${privacyLine()}</p>
      <p class="saved">Prototype · speech is simulated with sample words.</p>
    </aside>`;
  }

  W.Voice = {
    sess: null,
    cap: null,
    renderInbox() {
      const c = target();
      return `<section class="inbox-layout"><div class="content inbox-main">
        <div class="inbox-head"><h1>Inbox</h1><label class="inbox-target"><span>Send to</span><select data-inbox-target>${chapters()
          .map((x) => `<option value="${x.id}"${x.id === c.id ? " selected" : ""}>Chapter ${x.n}: ${UI.esc(x.title)}</option>`)
          .join("")}</select></label></div>
        <p class="muted">Voice notes and quick thoughts land here. Clean them up, then send them where they belong.</p>
        <div id="inboxList">${listHTML()}</div>
      </div>${captureHTML()}</section>`;
    },
    applyCommands(text) {
      return String(text)
        .replace(/\s*\bnew (?:line|paragraph)\b\s*/gi, "\n")
        .replace(/\s*\bnew beat\b\s*/gi, "\n• ")
        .replace(/\s*\bcomma\b/gi, ",")
        .replace(/\s*\bperiod\b/gi, ".")
        .replace(/\s*\bquestion mark\b/gi, "?")
        .replace(/(^|[.?!]\s+|\n(?:• )?)([a-z])/g, (m, a, b) => a + b.toUpperCase())
        .replace(/[ \t]+$/gm, "")
        .trim();
    },
    process(raw) {
      return S().settings.voiceCommands !== false ? this.applyCommands(raw) : String(raw).trim();
    },
    /* ---------- Inline dictation (one session at a time) ---------- */
    dictate(btn) {
      if (!btn) return UI.toast("Open a chapter to dictate");
      const same = this.sess?.btn === btn;
      this.halt();
      if (same) return;
      const kind = btn.matches("[data-dictate]") ? "prose" : btn.dataset.inlineMic === "beats" ? "beats" : btn.dataset.inlineMic || "notes",
        sink = kind === "prose" ? this.proseSink() : kind === "beats" ? this.beatsSink(btn) : this.fieldSink(btn);
      if (!sink) return;
      const list = (MOCK[kind] || MOCK.notes).split(" "),
        sess = (this.sess = { btn, kind, sink, raw: "", i: 0 });
      btn.setAttribute("aria-pressed", "true");
      btn.classList.add("mic-live");
      this.showPill(`Listening · ${LABEL[kind] || "dictation"} · ${engineName()}`);
      sess.timer = setInterval(() => {
        if (!sink.alive()) return this.stopDictation("lost");
        if (sess.i < list.length) {
          sess.raw += (sess.i ? " " : "") + list[sess.i++];
          sink.update(this.process(sess.raw));
        } else if (!sess.doneAt) sess.doneAt = Date.now();
        // A real recogniser ends the utterance after a pause.
        else if (Date.now() - sess.doneAt > 1000) this.stopDictation("pause");
      }, WORD_MS);
    },
    stopDictation(reason) {
      const sess = this.sess;
      if (!sess) return false;
      clearInterval(sess.timer);
      this.sess = null;
      sess.btn.setAttribute("aria-pressed", "false");
      sess.btn.classList.remove("mic-live");
      const msg = sess.sink.finish(this.process(sess.raw));
      // Hand the caret back when the writer isn't already somewhere else. Focus on the pill's Stop button
      // counts as nowhere: the pill is about to hide.
      const a = D.activeElement,
        inPill = !!a?.closest?.("#dictationPill");
      if (inPill || ((reason === "pause" || reason === "pill") && (!a || a === D.body || a === sess.btn))) sess.sink.focus();
      this.hidePill();
      UI.toast(msg || "Dictation stopped · nothing heard");
      return true;
    },
    proseSink() {
      const Wr = W.Write;
      if (S().screen !== "write" || !Wr?.caretRange) return UI.toast("Open a chapter to dictate"), null;
      const range = Wr.caretRange(),
        node = range && (range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement),
        prose = node?.closest(".prose[data-scene]");
      if (!prose) return UI.toast("Click in your chapter first"), null;
      const para = node.closest("p") || prose,
        pre = D.createRange(),
        post = D.createRange();
      pre.selectNodeContents(para);
      pre.setEnd(range.startContainer, range.startOffset);
      post.selectNodeContents(para);
      post.setStart(range.endContainer, range.endOffset);
      const lead = /\S$/.test(pre.toString()) ? " " : "",
        trail = /^[\p{L}\p{N}]/u.test(post.toString()) ? " " : "",
        flat = (t) => t.replace(/\s*\n•?\s*/g, " ").trim(),
        span = D.createElement("span"),
        textAt = (n, o) => {
          const r = D.createRange();
          r.selectNodeContents(prose);
          r.setEnd(n, o);
          return r.toString().length;
        };
      span.className = "dictating";
      range.insertNode(span);
      const start = textAt(span, 0);
      let done = null,
        end = 0;
      // Puts the caret after the new words (before any spacer), so whatever comes next follows them.
      const park = () => {
        // Setting the selection focuses the prose in Chrome, so an unfocused prose only gets the remembered
        // caret, which is restored when the writer comes back to it.
        if (D.activeElement === prose) return W.getSelection().collapse(done, end);
        const pos = (Wr._lastPos = { key: prose.dataset.scene, a: start + end, as: false, f: start + end, fs: false, pi: [...prose.querySelectorAll("p")].indexOf(para) });
        prose.addEventListener("focus", () => Wr._lastPos === pos && done.isConnected && W.getSelection().collapse(done, end), { once: true });
      };
      return {
        alive: () => span.isConnected,
        update: (t) => (span.textContent = lead + flat(t) + trail),
        finish: (t) => {
          if (!span.isConnected) return "Dictation stopped";
          const text = flat(t),
            lp = Wr._lastPos,
            // The writer's caret is still where dictation began (no clicking or typing elsewhere meanwhile).
            still = lp?.key === prose.dataset.scene && Math.max(lp.a, lp.f) === start && textAt(span, 0) === start;
          if (text) {
            span.replaceWith((done = D.createTextNode(lead + text + trail)));
            end = lead.length + text.length;
            if (still) park();
          } else span.remove();
          prose.dispatchEvent(new Event("input", { bubbles: true }));
          Wr.flush();
          return text ? `Dictation added · ${plural(words(text), "word")}` : "";
        },
        focus: () => {
          if (!prose.isConnected) return;
          prose.focus({ preventScroll: true });
          if (done?.isConnected) W.getSelection().collapse(done, end);
        },
      };
    },
    fieldSink(btn) {
      const el = btn.closest(".field,label,.popover,.reply-row")?.querySelector("textarea,input:not([type=checkbox]):not([type=radio]):not([type=number]):not([type=range])");
      if (!el) return UI.toast("There's nothing to dictate into here"), null;
      const base = el.value,
        single = el.tagName === "INPUT",
        sep = base.trim() ? (single || btn.dataset.inlineMic === "summary" ? " " : "\n") : "",
        start = base.trim() ? base.replace(/\s+$/, "") + sep : "",
        shape = (t) => (single ? t.replace(/\s*\n•?\s*/g, " ") : t).trim(),
        fire = (type) => el.dispatchEvent(new Event(type, { bubbles: true })),
        // A field whose popover, drawer or pane closed stops listening.
        shown = () => el.isConnected && el.getClientRects().length > 0;
      el.classList.add("dictating-field");
      return {
        alive: shown,
        update: (t) => {
          el.value = start + shape(t);
          el.scrollTop = el.scrollHeight;
          fire("input");
        },
        finish: (t) => {
          el.classList.remove("dictating-field");
          const text = shape(t);
          if (!shown()) return "Dictation stopped";
          el.value = text ? start + text : base;
          fire("input");
          fire("change");
          return text ? `Dictation added to ${LABEL[btn.dataset.inlineMic] || "the field"}` : "";
        },
        focus: () => {
          if (!el.isConnected) return;
          el.focus();
          el.setSelectionRange?.(el.value.length, el.value.length);
        },
      };
    },
    beatsSink(btn) {
      const cid = btn.closest(".field")?.querySelector("[data-beats-for]")?.dataset.beatsFor,
        c = cid && W.App.chapter(cid);
      if (!c) return UI.toast("Open a chapter to add beats"), null;
      c.beats = c.beats || [];
      const start = c.beats.length,
        split = (t) => t.split("\n").map((s) => s.replace(/^•\s*/, "").trim()),
        mark = () =>
          D.querySelectorAll(`.beat-list[data-beats-for="${cid}"] [data-beat-text]`).forEach((el) => {
            const i = +el.dataset.beatText.split(":")[1];
            el.classList.toggle("dictating-field", i >= start && i < start + made);
          });
      let made = 0;
      return {
        alive: () => !!W.App.chapter(cid),
        update: (t) => {
          // "new beat" opens the next beat; a beat is only created once it has words.
          for (const [k, p] of split(t).entries()) {
            if (k < made) c.beats[start + k][0] = p;
            else if (p) W.Plan.addBeat(cid, p, false, start + made++);
            else break;
          }
          W.App.save();
          W.Plan.refreshBeats(cid);
          mark();
        },
        finish: () => {
          for (let k = made - 1; k >= 0; k--)
            if (!c.beats[start + k]?.[0]?.trim()) {
              c.beats.splice(start + k, 1);
              made--;
            }
          W.App.save();
          W.Plan.refreshBeats(cid);
          W.App.planNow();
          return made ? `Added ${plural(made, "beat")} to Chapter ${c.n}` : "";
        },
        focus: () => D.querySelector(`.beat-list[data-beats-for="${cid}"] [data-beat-text="${cid}:${start + Math.max(0, made - 1)}"]`)?.focus(),
      };
    },
    // One persistent live region, so screen readers hear "Listening…" when it appears.
    showPill(text) {
      let p = D.getElementById("dictationPill");
      if (!p) {
        p = D.createElement("div");
        p.id = "dictationPill";
        p.className = "dictation-pill";
        p.setAttribute("role", "status");
        p.innerHTML = `<span class="rec-dot" aria-hidden="true"></span><span class="pill-text"></span><button class="small-btn" type="button">Stop</button>`;
        p.querySelector("button").addEventListener("click", () => this.stopDictation("pill"));
        D.body.appendChild(p);
      }
      p.hidden = false;
      requestAnimationFrame(() => (p.querySelector(".pill-text").textContent = text));
    },
    hidePill() {
      const p = D.getElementById("dictationPill");
      if (!p) return;
      p.hidden = true;
      p.querySelector(".pill-text").textContent = "";
    },

    /* ---------- Quick capture (Inbox) ---------- */
    startCapture() {
      if (this.cap) return this.stopCapture();
      const ta = D.getElementById("voiceText"),
        btn = D.querySelector("[data-record]");
      if (!ta || !btn) return;
      this.stopDictation("halt");
      this.settleCapture();
      const memo = S().voiceMode === "memo",
        list = MOCK.capture.split(" "),
        cap = (this.cap = { memo, ta, raw: "", i: 0, t0: Date.now(), base: ta.value.trim() ? ta.value.replace(/\s*$/, "\n") : "" });
      ta.readOnly = true;
      this.setRecording(true);
      this.capStatus(memo ? "Recording memo · 0:00" : `Listening · ${engineName()}`);
      cap.timer = setInterval(() => {
        if (!ta.isConnected) return this.stopCapture(true);
        if (cap.i < list.length) {
          cap.raw += (cap.i ? " " : "") + list[cap.i++];
          if (!memo) this.showCapture(cap);
        } else if (!cap.doneAt) cap.doneAt = Date.now();
        if (memo) this.capStatus(`Recording memo · 0:${String(Math.floor((Date.now() - cap.t0) / 1000)).padStart(2, "0")}`);
        if (cap.doneAt && Date.now() - cap.doneAt > (memo ? 1600 : 1000)) this.stopCapture(false, true);
      }, 110);
      btn.focus();
    },
    showCapture(cap) {
      cap.ta.value = cap.base + this.process(cap.raw);
      cap.ta.scrollTop = cap.ta.scrollHeight;
      S().voiceDraft = cap.ta.value;
    },
    stopCapture(now, auto) {
      const cap = this.cap;
      if (!cap) return false;
      clearInterval(cap.timer);
      this.cap = null;
      this.setRecording(false);
      const finish = () => {
        this._finish = null;
        cap.ta.readOnly = false;
        if (cap.raw) {
          this.showCapture(cap);
          this._spoken = true;
        }
        W.App.save();
        this.capStatus(cap.raw ? `${auto ? "Stopped after a pause" : "Stopped"} · ${plural(words(this.process(cap.raw)), "word")}` : "Nothing heard.");
      };
      if (cap.memo && cap.raw && !now) {
        this.capStatus("Transcribing…");
        this._finish = finish;
        this._transcribeT = setTimeout(finish, 700);
      } else finish();
      return true;
    },
    // A memo still "transcribing" lands before anything else touches the transcript.
    settleCapture() {
      this.stopCapture(true);
      if (!this._finish) return;
      clearTimeout(this._transcribeT);
      this._finish();
    },
    setRecording(on) {
      const btn = D.querySelector("[data-record]");
      if (btn) {
        btn.textContent = on ? "Stop" : "Record";
        btn.classList.toggle("recording", on);
      }
      D.querySelector(".capture .levels")?.classList.toggle("live", on);
    },
    capStatus(text) {
      const s = D.getElementById("capStatus");
      if (s) s.textContent = text;
    },
    setMode(m) {
      this.stopCapture(true);
      S().voiceMode = m;
      W.App.save();
      D.querySelectorAll("[data-voice-mode]").forEach((b) => {
        const on = b.dataset.voiceMode === m;
        b.classList.toggle("active", on);
        b.setAttribute("aria-pressed", String(on));
      });
      this.capStatus(m === "memo" ? "Records now, transcribes when you stop." : "Words appear as you speak.");
    },
    saveNote() {
      this.settleCapture();
      const ta = D.getElementById("voiceText"),
        text = (ta?.value || "").trim();
      if (!text) {
        ta?.focus();
        return UI.toast("Nothing to save yet · record or type a thought");
      }
      const st = S();
      st.inbox.unshift({ id: "n" + Date.now(), time: nowLabel(), origin: this._spoken ? `Voice · ${engineName().toLowerCase()}` : "Quick note", text });
      st.voiceDraft = "";
      this._spoken = false;
      ta.value = "";
      W.App.save();
      this.refreshList();
      this.capStatus("Saved. Ready for the next thought.");
      UI.toast("Saved to Inbox");
    },
    discard() {
      this.settleCapture();
      const ta = D.getElementById("voiceText");
      if (!ta?.value.trim()) return UI.toast("Nothing to discard");
      ta.value = "";
      S().voiceDraft = "";
      this._spoken = false;
      W.App.save();
      ta.focus();
      UI.toast("Draft discarded");
    },

    /* ---------- Inbox notes ---------- */
    note(id) {
      return S().inbox.find((n) => n.id === id);
    },
    refreshList(focusSel) {
      const list = D.getElementById("inboxList");
      if (list) list.innerHTML = listHTML();
      const n = S().inbox.length;
      D.querySelectorAll('[data-screen="inbox"] .badge').forEach((b) => {
        b.textContent = n;
        b.setAttribute("aria-label", plural(n, "note"));
      });
      if (focusSel) (D.querySelector(focusSel) || D.querySelector("#inboxList button") || D.getElementById("voiceText"))?.focus();
    },
    sent(n, dest) {
      n.sent = n.sent || [];
      if (!n.sent.includes(dest)) n.sent.push(dest);
    },
    clean(id) {
      const n = this.note(id);
      if (!n) return;
      if (n.raw != null) {
        n.text = n.raw;
        delete n.raw;
        W.App.save();
        this.refreshList(`[data-clean="${id}"]`);
        return UI.toast("Restored the original note");
      }
      const t = cleanText(n.text);
      if (t === n.text) return UI.toast("This note is already clean");
      n.raw = n.text;
      n.text = t;
      W.App.save();
      this.refreshList(`[data-clean="${id}"]`);
      UI.toast("Cleaned up · filler words removed");
    },
    turn(id, kind) {
      const n = this.note(id),
        c = target();
      if (!n || !c) return;
      const text = cleanText(n.text);
      let msg;
      if (kind === "beats") {
        const parts = sentences(text);
        parts.forEach((p) => W.Plan.addBeat(c.id, p, false));
        this.sent(n, `Beats · Ch ${c.n}`);
        msg = `Added ${plural(parts.length, "beat")} to Chapter ${c.n}`;
      } else if (kind === "summary") {
        c.summary = (c.summary ? c.summary.trim() + " " : "") + text;
        this.sent(n, `Summary · Ch ${c.n}`);
        msg = `Added to the Chapter ${c.n} summary`;
      } else {
        const r = W.Codex.fromNote(text),
          name = UI.cap(r.entry.name);
        this.sent(n, `Codex · ${name}`);
        msg = r.created ? `New codex entry: ${name}` : `Added to “${name}” in the Codex`;
      }
      W.App.save();
      this.refreshList(`[data-menu-toggle="turn-${id}"]`);
      UI.toast(msg);
    },
    file(id) {
      const n = this.note(id),
        c = target();
      if (!n || !c) return;
      c.notes = (c.notes ? c.notes.trimEnd() + "\n" : "") + "• " + n.text.trim();
      this.sent(n, `Notes · Ch ${c.n}`);
      W.App.save();
      this.refreshList(`[data-file="${id}"]`);
      UI.toast(`Filed to the Chapter ${c.n} notes`);
    },
    copy(id) {
      const n = this.note(id);
      if (!n) return;
      if (!navigator.clipboard) return UI.toast("Copying isn't available in this browser");
      navigator.clipboard.writeText(n.text).then(
        () => UI.toast("Note copied"),
        () => UI.toast("Couldn't copy · your browser blocked clipboard access"),
      );
    },
    remove(id) {
      const st = S(),
        i = st.inbox.findIndex((n) => n.id === id);
      if (i < 0) return;
      st.inbox.splice(i, 1);
      W.App.save();
      const next = st.inbox[Math.min(i, st.inbox.length - 1)];
      this.refreshList(next ? `[data-note="${next.id}"] [data-clean]` : "#voiceText");
      UI.toast("Note deleted");
    },

    // Stops whatever is listening without re-rendering; true if something was stopped (Esc uses this).
    halt() {
      const a = this.stopDictation("halt"),
        b = this.stopCapture(true);
      if (this._finish) {
        clearTimeout(this._transcribeT);
        this._finish();
      }
      return a || b;
    },
    wire(root) {
      root.addEventListener("click", (e) => {
        const q = (s) => e.target.closest(s);
        let b;
        if (q("[data-record]")) return this.startCapture();
        if ((b = q("[data-voice-mode]"))) return this.setMode(b.dataset.voiceMode);
        if (q("[data-save-note]")) return this.saveNote();
        if (q("[data-discard-note]")) return this.discard();
        if ((b = q("[data-clean]"))) return this.clean(b.dataset.clean);
        if ((b = q("[data-turn]"))) {
          const [id, kind] = b.dataset.turn.split(":");
          return this.turn(id, kind);
        }
        if ((b = q("[data-file]"))) return this.file(b.dataset.file);
        if ((b = q("[data-copy-note]"))) return this.copy(b.dataset.copyNote);
        if ((b = q("[data-delete-note]"))) return this.remove(b.dataset.deleteNote);
        // App switches the engine; keep the privacy line in step.
        if (q("[data-engine]")) {
          const p = D.getElementById("capPrivacy");
          if (p) p.textContent = privacyLine();
        }
      });
      root.addEventListener("input", (e) => {
        if (e.target.id !== "voiceText") return;
        S().voiceDraft = e.target.value;
        W.App.save();
      });
      root.addEventListener("change", (e) => {
        if (!e.target.matches("[data-inbox-target]")) return;
        S().inboxTarget = e.target.value;
        W.App.save();
        this.refreshList();
        UI.toast(`Notes will go to Chapter ${target().n}`);
      });
    },
  };
})();
