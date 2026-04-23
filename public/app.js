/**
 * ONLY CREATORS — Global App Utilities
 * Loaded on every page. React components handle their own state;
 * these utilities are available for any non-React HTML contexts.
 */

/* ─── Dropdown Menu ──────────────────────────────────────────*/
function toggleMenu(btn) {
  const dropdown = btn.nextElementSibling;
  const isOpen = dropdown.classList.contains('open');
  closeAllMenus();
  if (!isOpen) dropdown.classList.add('open');
}

function closeAllMenus() {
  document.querySelectorAll('.options-dropdown').forEach(d => d.classList.remove('open'));
}

document.addEventListener('click', function(e) {
  if (!e.target.closest('.more-wrap')) closeAllMenus();
});

/* ─── Like Toggle ────────────────────────────────────────────*/
function toggleLike(btn) {
  const isLiked = btn.classList.toggle('liked');
  const icon = btn.querySelector('.material-symbols-outlined');
  if (icon) {
    icon.style.fontVariationSettings = isLiked
      ? "'FILL' 1, 'wght' 400"
      : "'FILL' 0, 'wght' 200";
  }
  const countEl = btn.querySelector('.count');
  if (countEl) {
    const raw = countEl.textContent.trim();
    const isK = raw.endsWith('k');
    let num = isK ? parseFloat(raw) * 1000 : parseInt(raw, 10);
    num = isLiked ? num + 1 : num - 1;
    const display = num >= 1000 ? (num / 1000).toFixed(1) + 'k' : String(num);
    countEl.textContent = display;
  }
  btn.style.transform = 'scale(1.2)';
  setTimeout(() => { btn.style.transform = ''; }, 150);
}

/* ─── Save Toggle ────────────────────────────────────────────*/
function toggleSave(btn) {
  const isSaved = btn.classList.toggle('saved');
  const icon = btn.querySelector('.material-symbols-outlined');
  if (icon) {
    icon.style.fontVariationSettings = isSaved
      ? "'FILL' 1, 'wght' 400"
      : "'FILL' 0, 'wght' 200";
  }
  btn.setAttribute('aria-label', isSaved ? 'Unsave post' : 'Save post');
  btn.style.transform = 'scale(1.2)';
  setTimeout(() => { btn.style.transform = ''; }, 150);
}

/* ─── Dark Mode Toggle ───────────────────────────────────────*/
function toggleDarkMode() {
  const html = document.documentElement;
  const isDark = html.getAttribute('data-theme') === 'dark';
  html.setAttribute('data-theme', isDark ? 'light' : 'dark');
  localStorage.setItem('theme', isDark ? 'light' : 'dark');
}

/* ─── Init: restore saved theme ─────────────────────────────*/
(function initTheme() {
  const saved = localStorage.getItem('theme');
  if (saved) document.documentElement.setAttribute('data-theme', saved);
})();
