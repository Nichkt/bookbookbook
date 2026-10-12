// Runs before first paint so the page never flashes the wrong theme. Keep in sync with src/app/theme.ts.
(function () {
  var theme = "light";
  try {
    var saved = localStorage.getItem("bbb.theme");
    if (saved === "light" || saved === "sepia" || saved === "dark") theme = saved;
    else if (window.matchMedia("(prefers-color-scheme: dark)").matches) theme = "dark";
  } catch {
    // Storage blocked (private mode, strict settings): fall back to light.
  }
  document.documentElement.dataset.theme = theme;
})();
