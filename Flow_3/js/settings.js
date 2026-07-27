// Default expense categories — customizable from the Budgeting page (kept
// here for consistency with every page's data model / migration logic).
const DEFAULT_CATEGORIES = [
  { id: 'food',          label: 'Food',          color: '#FB923C' },
  { id: 'shopping',      label: 'Shopping',      color: '#F472B6' },
  { id: 'transport',     label: 'Transport',     color: '#60A5FA' },
  { id: 'entertainment', label: 'Entertainment', color: '#C084FC' },
  { id: 'housing',       label: 'Housing',       color: '#818CF8' },
  { id: 'utilities',     label: 'Utilities',     color: '#38BDF8' },
  { id: 'health',        label: 'Health',        color: '#FB7185' },
  { id: 'other',         label: 'Other',         color: '#9AA3B2' },
];
const INCOME_CATEGORY = { id: 'income', label: 'Income', color: '#34D399' };

const STORAGE_KEY = 'flow.v1';

function loadData() {
  const raw = localStorage.getItem(STORAGE_KEY);
  const data = raw ? JSON.parse(raw) : seedData();
  let migrated = !raw;
  if (!Array.isArray(data.categories)) { data.categories = DEFAULT_CATEGORIES.map(c => ({ ...c })); migrated = true; }
  if (!data.meta.colorTheme) { data.meta.colorTheme = 'blue'; migrated = true; }
  if (migrated) saveData(data);
  return data;
}
function saveData(data) { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }

function seedData() {
  return {
    meta: { currency: 'USD', theme: 'dark', colorTheme: 'blue' },
    transactions: [],
    categories: DEFAULT_CATEGORIES.map(c => ({ ...c })),
    budgets: { food: 0, shopping: 0, transport: 0, entertainment: 0, housing: 0, utilities: 0, health: 0, other: 0 },
    goals: [],
  };
}

function catInfo(data, id) {
  if (id === 'income') return INCOME_CATEGORY;
  const found = (data.categories || []).find(c => c.id === id);
  if (found) return found;
  return { id, label: id ? id.charAt(0).toUpperCase() + id.slice(1) : 'Uncategorized', color: '#9AA3B2' };
}

function uid(prefix = 'txn') { return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function escapeHtml(str) { const div = document.createElement('div'); div.textContent = str == null ? '' : str; return div.innerHTML; }

function showToast(message) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.innerHTML = `<span class="dot"></span> ${escapeHtml(message)}`;
  el.hidden = false;
  requestAnimationFrame(() => el.classList.add('show'));
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { el.classList.remove('show'); setTimeout(() => { el.hidden = true; }, 250); }, 2400);
}

/* ================= Settings-specific ================= */

const COLOR_THEMES = ['blue', 'violet', 'emerald', 'sunset', 'rose', 'cyan'];
function applyColorTheme(theme) {
  COLOR_THEMES.forEach(t => document.body.classList.remove('theme-' + t));
  if (theme !== 'blue') document.body.classList.add('theme-' + theme);
}

function renderSettings() {
  const data = loadData();
  document.getElementById('theme-toggle').classList.toggle('on', data.meta.theme === 'light');
  document.getElementById('currency-select').value = data.meta.currency || 'USD';
  document.getElementById('openai-key').value = data.meta.openaiKey || '';
  document.body.classList.toggle('light', data.meta.theme === 'light');

  const activeColorTheme = data.meta.colorTheme || 'blue';
  applyColorTheme(activeColorTheme);
  document.querySelectorAll('#color-theme-swatches .theme-swatch').forEach(sw => {
    sw.classList.toggle('active', sw.dataset.theme === activeColorTheme);
  });
}

function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

function exportCSV() {
  const data = loadData();
  const rows = [['Date', 'Type', 'Category', 'Description', 'Amount', 'Notes']];
  data.transactions.forEach(t => {
    rows.push([t.date, t.type, catInfo(data, t.category).label, t.description, t.amount, t.notes || '']);
  });
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  downloadFile(`flow-transactions-${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv');
  showToast('CSV exported');
}

function exportJSON() {
  const data = loadData();
  downloadFile(`flow-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2), 'application/json');
  showToast('Data exported');
}

function importJSON(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const parsed = JSON.parse(e.target.result);
      if (!parsed.transactions || !parsed.budgets) throw new Error('invalid');
      saveData(parsed);
      renderSettings();
      showToast('Data imported');
    } catch (err) {
      showToast('That file doesn\u2019t look like a valid Flow backup.');
    }
  };
  reader.readAsText(file);
}

function wireSettings() {
  document.getElementById('theme-toggle').addEventListener('click', () => {
    const isLight = document.body.classList.toggle('light');
    const data = loadData();
    data.meta.theme = isLight ? 'light' : 'dark';
    saveData(data);
    document.getElementById('theme-toggle').classList.toggle('on', isLight);
  });

  document.getElementById('currency-select').addEventListener('change', (e) => {
    const data = loadData();
    data.meta.currency = e.target.value;
    saveData(data);
    showToast('Currency updated');
  });

  document.querySelectorAll('#color-theme-swatches .theme-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      const theme = sw.dataset.theme;
      const data = loadData();
      data.meta.colorTheme = theme;
      saveData(data);
      applyColorTheme(theme);
      document.querySelectorAll('#color-theme-swatches .theme-swatch').forEach(s => s.classList.toggle('active', s === sw));
      showToast('Color theme updated');
    });
  });

  document.getElementById('save-key-btn').addEventListener('click', () => {
    const data = loadData();
    data.meta.openaiKey = document.getElementById('openai-key').value.trim();
    saveData(data);
    showToast('API key saved');
  });

  document.getElementById('export-csv-btn').addEventListener('click', exportCSV);
  document.getElementById('export-json-btn').addEventListener('click', exportJSON);
  document.getElementById('import-input').addEventListener('change', (e) => importJSON(e.target.files[0]));

  document.getElementById('reset-btn').addEventListener('click', () => {
    if (confirm('Reset Flow and erase all your data? This cannot be undone.')) {
      localStorage.removeItem(STORAGE_KEY);
      loadData();
      renderSettings();
      showToast('All data reset');
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  wireSettings();
  renderSettings();
});
