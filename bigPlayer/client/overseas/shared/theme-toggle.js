/* Overseas Theme Toggle - light/dark via [data-theme] on <html>
   Load in <head> with synchronous <script src> to avoid FOUC. */
(function () {
  var KEY = 'bigPlayer-overseas-theme';
  var saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) {}
  var theme = saved || (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', theme);

  window.toggleTheme = function () {
    var cur = document.documentElement.getAttribute('data-theme') || 'light';
    var nxt = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', nxt);
    try { localStorage.setItem(KEY, nxt); } catch (e) {}
  };
})();
