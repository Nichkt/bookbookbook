(function () {
  "use strict";
  const W = window,
    D = document;
  const iconMap = {
    mic: "M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3Zm7 9a7 7 0 0 1-14 0M12 18v4M8 22h8",
    gear: "M12.2 2h-.4l-1 2.4a7.8 7.8 0 0 0-1.8.8L6.6 4.2l-2.4 2.4 1 2.3a8 8 0 0 0-.8 1.9L2 11.8v.4l2.4 1a7.8 7.8 0 0 0 .8 1.8l-1 2.4 2.4 2.4 2.3-1a8 8 0 0 0 1.9.8l1 2.4h.4l1-2.4a7.8 7.8 0 0 0 1.8-.8l2.4 1 2.4-2.4-1-2.3a8 8 0 0 0 .8-1.9l2.4-1v-.4l-2.4-1a7.8 7.8 0 0 0-.8-1.8l1-2.4-2.4-2.4-2.3 1a8 8 0 0 0-1.9-.8L12.2 2ZM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z",
    search: "m21 21-4.3-4.3M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z",
    x: "M18 6 6 18M6 6l12 12",
    plus: "M12 5v14M5 12h14",
    play: "M8 5v14l11-7-11-7Z",
    clock: "M12 6v6l4 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
    palette: "M12 3a9 9 0 0 0 0 18h1.5a2 2 0 0 0 0-4H15a2 2 0 0 1 0-4h1a5 5 0 0 0 0-10H12Z",
    thumbs: "M7 11v10H3V11h4Zm0 0 5-8 1 1v6h6l1 2-3 9H7",
    thumbsDown: "M17 13V3h4v10h-4Zm0 0-5 8-1-1v-6H5l-1-2 3-9h10",
    more: "M5 12h.01M12 12h.01M19 12h.01",
    book: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15Z",
    filter: "M3 5h18M6 12h12M10 19h4",
    spark: "M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2Z",
    quote: "M7 7h4v4H9v3H6v-4a3 3 0 0 1 3-3Zm10 0h4v4h-2v3h-3v-4a3 3 0 0 1 3-3Z",
    panel: "M3 5h18v14H3zM15 5v14",
    pen: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z",
    shrink: "M8 3v5H3M16 3v5h5M8 21v-5H3M16 21v-5h5",
    list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
    user: "M20 21a8 8 0 0 0-16 0M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
    eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z",
  };
  W.UI = {
    esc: (s) =>
      String(s ?? "").replace(
        /[&<>"']/g,
        (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
      ),
    icon: (name) =>
      `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="${iconMap[name] || iconMap.plus}"/></svg>`,
    cap: (s) => (s ? s[0].toUpperCase() + s.slice(1) : ""),
    singular: (type) => String(type || "").replace(/s$/, ""),
    btn: (label, cls = "", attrs = "") => `<button class="${cls || "small-btn"}" ${attrs}>${label}</button>`,
    toast(msg) {
      const t = D.getElementById("toast");
      t.textContent = msg;
      t.classList.add("show");
      clearTimeout(this._to);
      this._to = setTimeout(() => t.classList.remove("show"), 2500);
    },
    clearToast() {
      const t = D.getElementById("toast");
      if (t) t.classList.remove("show");
      clearTimeout(this._to);
    },
    modal(id, title, body, extra = "") {
      return `<div id="${id}" class="modal ${extra}"><div class="scrim" data-close></div><div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="${id}-title"><button class="icon-btn" data-close aria-label="Close" style="float:right">${this.icon("x")}</button><h2 id="${id}-title">${title}</h2>${body}</div></div>`;
    },
    drawer(body) {
      return `<div id="drawer" class="drawer"><div class="scrim" data-close></div><aside class="drawer-panel" role="dialog" aria-modal="true" aria-labelledby="drawerTitle">${body}</aside></div>`;
    },
    setTheme(theme) {
      document.documentElement.dataset.theme = theme;
    },
    status(s) {
      return `<span class="status ${s}">${s}</span>`;
    },
    initials(name) {
      return name
        .replace(/^(the|a|an)\s+/i, "")
        .split(/\s+/)
        .filter((p) => /\p{L}/u.test(p[0] || ""))
        .map((p) => p[0])
        .slice(0, 2)
        .join("");
    },
    wireCommon() {
      // Modal layers keep Tab inside themselves; the page behind them is covered by a scrim.
      const FOCUSABLE = 'a[href],button,input,select,textarea,summary,[tabindex],[contenteditable="true"]';
      const trapTab = (e) => {
        const layers = [...D.querySelectorAll(".modal.open,.drawer.open,.palette.open,.read-overlay.open")],
          a = D.activeElement,
          layer = layers.find((l) => l.contains(a)) || layers.pop();
        if (!layer) return;
        const items = [...layer.querySelectorAll(FOCUSABLE)].filter((el) => !el.disabled && el.tabIndex >= 0 && el.getClientRects().length && getComputedStyle(el).visibility !== "hidden"),
          dir = e.shiftKey ? Node.DOCUMENT_POSITION_PRECEDING : Node.DOCUMENT_POSITION_FOLLOWING;
        if (layer.contains(a) && items.some((el) => a.compareDocumentPosition(el) & dir)) return;
        e.preventDefault();
        items[e.shiftKey ? items.length - 1 : 0]?.focus();
      };
      D.addEventListener("click", (e) => {
        const close = e.target.closest("[data-close]");
        if (close) {
          close.closest(".modal,.drawer,.sheet,.palette,.read-overlay")?.classList.remove("open");
          W.App?.clearMenus();
        }
      });
      D.addEventListener("keydown", (e) => {
        if (e.key === "Tab" && !e.defaultPrevented) trapTab(e);
        // Esc peels one layer at a time: editor popups, dictation, menus, overlays, then focus mode.
        if (e.key === "Escape") {
          if (W.Write?.onEscape?.() || W.Voice?.halt?.()) return;
          const pop = D.querySelector(".menu-pop.open");
          if (pop) {
            pop.classList.remove("open");
            const t = pop.closest(".menu-wrap")?.querySelector("[data-menu-toggle]");
            t?.setAttribute("aria-expanded", "false");
            if (pop.contains(D.activeElement) || D.activeElement === D.body) t?.focus();
            return;
          }
          const layers = D.querySelectorAll(".modal.open,.drawer.open,.sheet.open,.palette.open,.read-overlay.open");
          if (layers.length) {
            layers.forEach((x) => x.classList.remove("open"));
            W.App?.clearMenus();
            return;
          }
          if (D.querySelector(".floating-menu.open,.context-menu.open,.popover.open")) return W.App?.clearMenus();
          if (D.body.classList.contains("focus-mode")) W.Write?.exitFocus();
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
          e.preventDefault();
          W.App?.openPalette();
        }
        if (e.ctrlKey && e.key.toLowerCase() === "j") {
          e.preventDefault();
          W.Write?.runAI("Continue");
        }
        if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "f") {
          e.preventDefault();
          W.Write?.openFind();
        }
        if (e.ctrlKey && e.key === ".") {
          e.preventDefault();
          W.Write?.toggleFocus();
        }
      });
      // Overlays take focus when they open and hand it back (caret included) when they close.
      const OVERLAY = ".modal,.drawer,.palette,.read-overlay";
      let back = null;
      // Views re-render while an overlay is open, so remember how to find the opener's replacement.
      const keyOf = (el) => {
        if (el.id) return "#" + CSS.escape(el.id);
        const a = [...el.attributes].filter((x) => x.name.startsWith("data-") && !/^data-(empty|autofocus)$/.test(x.name));
        return a.length ? el.tagName.toLowerCase() + a.map((x) => `[${x.name}="${CSS.escape(x.value)}"]`).join("") : null;
      };
      D.addEventListener(
        "focusout",
        (e) => {
          const el = e.target;
          if (!(el instanceof Element) || el.closest(OVERLAY)) return;
          const sel = W.getSelection();
          back = { el, key: keyOf(el), range: sel.rangeCount && el.contains(sel.anchorNode) ? sel.getRangeAt(0).cloneRange() : null };
        },
        true,
      );
      new MutationObserver((records) => {
        for (const r of records) {
          const ov = r.target;
          if (!ov.matches(OVERLAY)) continue;
          const was = /(^|\s)open(\s|$)/.test(r.oldValue || ""),
            is = ov.classList.contains("open");
          if (is && !was && !ov.contains(D.activeElement)) {
            const t = ov.querySelector("[data-autofocus]") || ov.querySelector(".modal-card,.drawer-panel") || ov.querySelector("button");
            if (t && !t.matches("button,input,select,textarea,[tabindex]")) t.tabIndex = -1;
            t?.focus({ preventScroll: true });
            // Typing into an existing value should append to it, not prepend.
            if (t?.selectionStart != null && t.selectionStart === 0 && t.selectionEnd === 0) t.setSelectionRange(t.value.length, t.value.length);
          } else if (was && !is && back && (D.activeElement === D.body || ov.contains(D.activeElement))) {
            const live = back.el.isConnected ? back.el : back.key && D.querySelector(back.key);
            if (!live || live.closest(OVERLAY)) continue;
            // A menu item that opened this overlay is hidden now, so hand focus to its menu button.
            const wrap = live.closest(".menu-pop") && live.closest(".menu-wrap"),
              el = wrap ? wrap.querySelector("[data-menu-toggle]") : live;
            if (!el) continue;
            const range = !wrap && back.range && D.contains(back.range.startContainer) ? back.range : null;
            if (el.isContentEditable && !range) continue;
            el.focus({ preventScroll: true });
            if (range) {
              const s = W.getSelection();
              s.removeAllRanges();
              s.addRange(range);
            }
          }
        }
      }).observe(D.body, { subtree: true, attributes: true, attributeFilter: ["class"], attributeOldValue: true });
    },
  };
})();
