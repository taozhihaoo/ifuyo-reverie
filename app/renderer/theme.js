/**
 * Theme controller (Post-1.0): light / dark / system + soft accent colors.
 * Applies data-theme / data-accent on <html>; persists in localStorage.
 * Classic script; exposes window.Theme.
 */
(function () {
  const KEY_THEME = 'reverie.theme';
  const KEY_ACCENT = 'reverie.accent';
  const ACCENTS = ['mist', 'sage', 'mauve', 'apricot'];

  function current() {
    let theme = 'system';
    let accent = 'mist';
    try {
      theme = localStorage.getItem(KEY_THEME) || 'system';
      accent = localStorage.getItem(KEY_ACCENT) || 'mist';
    } catch { /* */ }
    if (!['light', 'dark', 'system'].includes(theme)) theme = 'system';
    if (!ACCENTS.includes(accent)) accent = 'mist';
    return { theme, accent };
  }

  function apply() {
    const { theme, accent } = current();
    const dark = theme === 'dark'
      || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.dataset.accent = accent;
  }

  function setTheme(theme) {
    if (!['light', 'dark', 'system'].includes(theme)) return;
    try { localStorage.setItem(KEY_THEME, theme); } catch { /* */ }
    apply();
  }

  function setAccent(accent) {
    if (!ACCENTS.includes(accent)) return;
    try { localStorage.setItem(KEY_ACCENT, accent); } catch { /* */ }
    apply();
  }

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (current().theme === 'system') apply();
  });

  window.Theme = { apply, setTheme, setAccent, current, ACCENTS };
  apply();
})();
