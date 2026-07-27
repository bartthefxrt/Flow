// Default expense categories — the user can add, rename, recolor, or
// delete their own from this page, so this is only the starting point.
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
const CATEGORY_COLOR_PALETTE = ['#FB923C', '#F472B6', '#60A5FA', '#C084FC', '#818CF8', '#38BDF8', '#FB7185', '#34D399', '#FBBF24', '#A3E635', '#F87171', '#9AA3B2'];

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

// Look up a category's label/color by id, falling back gracefully for
// categories that were later renamed or deleted (e.g. an old transaction
// still pointing at a category the user removed).
function catInfo(data, id) {
  if (id === 'income') return INCOME_CATEGORY;
  const found = (data.categories || []).find(c => c.id === id);
  if (found) return found;
  return { id, label: id ? id.charAt(0).toUpperCase() + id.slice(1) : 'Uncategorized', color: '#9AA3B2' };
}

function uid(prefix = 'txn') { return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

function fmtMoney(amount, decimals = 0) {
  const symbols = { USD: '$', EUR: '€', GBP: '£', JPY: '¥' };
  const data = loadData();
  const symbol = symbols[data.meta.currency] || '$';
  const sign = amount < 0 ? '-' : '';
  return sign + symbol + Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
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

const COLOR_THEMES = ['blue', 'violet', 'emerald', 'sunset', 'rose', 'cyan'];
function applyTheme(data) {
  document.body.classList.toggle('light', data.meta.theme === 'light');
  COLOR_THEMES.forEach(t => document.body.classList.remove('theme-' + t));
  const ct = data.meta.colorTheme || 'blue';
  if (ct !== 'blue') document.body.classList.add('theme-' + ct);
}
function initTheme() { applyTheme(loadData()); }

/* ================= Budgeting-specific ================= */

function monthSpendByCategory(data) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  const byCat = {};
  data.transactions
    .filter(t => t.type === 'expense' && new Date(t.date) >= start && new Date(t.date) <= end)
    .forEach(t => { byCat[t.category] = (byCat[t.category] || 0) + t.amount; });
  return byCat;
}

function renderBudgets() {
  const data = loadData();
  const spent = monthSpendByCategory(data);
  const entries = data.categories.map(c => ({
    cat: c.id, limit: data.budgets[c.id] || 0, spent: spent[c.id] || 0, label: c.label, color: c.color,
  })).sort((a, b) => (b.spent / (b.limit || 1)) - (a.spent / (a.limit || 1)));

  const totalLimit = entries.reduce((s, b) => s + b.limit, 0);
  const totalSpent = entries.reduce((s, b) => s + b.spent, 0);
  document.getElementById('total-budgeted').textContent = fmtMoney(totalLimit);
  document.getElementById('total-spent').textContent = fmtMoney(totalSpent);
  const remainingEl = document.getElementById('total-remaining');
  remainingEl.textContent = fmtMoney(totalLimit - totalSpent);
  remainingEl.style.color = (totalLimit - totalSpent) < 0 ? 'var(--danger)' : 'var(--text)';

  if (!entries.length) {
    document.getElementById('budgets-grid').innerHTML = `
      <div class="budgets-empty">
        <p>No budget categories yet. Add the ones that match your actual spending.</p>
        <button class="btn btn-primary" id="empty-add-category-btn">+ Add Category</button>
      </div>`;
    const btn = document.getElementById('empty-add-category-btn');
    if (btn) btn.addEventListener('click', () => openEditModal(null));
    return;
  }

  document.getElementById('budgets-grid').innerHTML = entries.map(b => {
    const pct = b.limit > 0 ? Math.min(100, (b.spent / b.limit) * 100) : 0;
    const over = b.spent > b.limit;
    const status = over ? 'over' : pct >= 80 ? 'warn' : 'ok';
    const statusText = over ? `Over by ${fmtMoney(b.spent - b.limit)}` : `${fmtMoney(b.limit - b.spent)} remaining`;
    return `
      <div class="card budget-card">
        <div class="budget-card-top">
          <span class="budget-card-icon" style="background:${b.color}22;color:${b.color}">${escapeHtml(b.label[0] || '?')}</span>
          <span class="budget-card-name">${escapeHtml(b.label)}</span>
          <button class="btn-icon budget-card-edit act-edit-budget" data-cat="${b.cat}" title="Edit category">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>
          </button>
        </div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%; background:${over ? 'var(--danger)' : b.color}"></div></div>
        <div class="budget-numbers"><span>Spent</span><b class="mono">${fmtMoney(b.spent)}</b></div>
        <div class="budget-numbers"><span>Budget</span><b class="mono">${fmtMoney(b.limit)}</b></div>
        <div class="budget-status ${status}">${statusText}</div>
      </div>`;
  }).join('');
}

function renderColorSwatches(selectedColor) {
  const wrap = document.getElementById('edit-color-swatches');
  wrap.innerHTML = CATEGORY_COLOR_PALETTE.map(c =>
    `<button type="button" class="color-swatch${c === selectedColor ? ' active' : ''}" data-color="${c}" style="background:${c}"></button>`
  ).join('');
  wrap.querySelectorAll('.color-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      wrap.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
      sw.classList.add('active');
    });
  });
}

function openEditModal(catId) {
  const data = loadData();
  const isNew = !catId;
  const cat = isNew ? null : data.categories.find(c => c.id === catId);

  document.getElementById('edit-modal-title').textContent = isNew ? 'Add Category' : 'Edit Category';
  document.getElementById('edit-cat-key').value = catId || '';
  document.getElementById('edit-cat-name').value = cat ? cat.label : '';
  document.getElementById('edit-amount').value = cat ? (data.budgets[cat.id] || 0) : 0;
  document.getElementById('edit-delete').hidden = isNew;
  renderColorSwatches(cat ? cat.color : CATEGORY_COLOR_PALETTE[data.categories.length % CATEGORY_COLOR_PALETTE.length]);

  document.getElementById('edit-modal-overlay').hidden = false;
  document.getElementById('edit-cat-name').focus();
}
function closeEditModal() { document.getElementById('edit-modal-overlay').hidden = true; }

function wireBudgets() {
  document.getElementById('add-category-btn').addEventListener('click', () => openEditModal(null));

  document.getElementById('budgets-grid').addEventListener('click', (e) => {
    const btn = e.target.closest('.act-edit-budget');
    if (btn) openEditModal(btn.dataset.cat);
  });
  document.getElementById('edit-modal-close').addEventListener('click', closeEditModal);
  document.getElementById('edit-cancel').addEventListener('click', closeEditModal);
  document.getElementById('edit-modal-overlay').addEventListener('click', (e) => { if (e.target.id === 'edit-modal-overlay') closeEditModal(); });

  document.getElementById('edit-delete').addEventListener('click', () => {
    const catId = document.getElementById('edit-cat-key').value;
    if (!catId) return;
    const data = loadData();
    const cat = data.categories.find(c => c.id === catId);
    const label = cat ? cat.label : catId;
    if (!confirm(`Delete "${label}"? Existing transactions in this category will keep showing but won't count toward any budget.`)) return;
    data.categories = data.categories.filter(c => c.id !== catId);
    delete data.budgets[catId];
    saveData(data);
    closeEditModal();
    renderBudgets();
    showToast('Category deleted');
  });

  document.getElementById('edit-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const catId = document.getElementById('edit-cat-key').value;
    const name = document.getElementById('edit-cat-name').value.trim();
    const amount = parseFloat(document.getElementById('edit-amount').value);
    const activeSwatch = document.querySelector('#edit-color-swatches .color-swatch.active');
    const color = activeSwatch ? activeSwatch.dataset.color : CATEGORY_COLOR_PALETTE[0];
    if (!name) { showToast('Enter a category name.'); return; }
    if (isNaN(amount) || amount < 0) { showToast('Enter a valid amount.'); return; }

    const data = loadData();
    if (catId) {
      const cat = data.categories.find(c => c.id === catId);
      cat.label = name;
      cat.color = color;
      data.budgets[catId] = amount;
      showToast('Category updated');
    } else {
      const id = uid('cat');
      data.categories.push({ id, label: name, color });
      data.budgets[id] = amount;
      showToast('Category added');
    }
    saveData(data);
    closeEditModal();
    renderBudgets();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  wireBudgets();
  renderBudgets();
});
