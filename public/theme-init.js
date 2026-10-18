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
  // The header's color, for the browser's or the installed app's title bar.
  var colors = { light: "#fbf8f2", sepia: "#f6edd9", dark: "#1b1e24" };
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", colors[theme]);
})();
