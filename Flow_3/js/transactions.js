// Default expense categories — customizable from the Budgeting page.
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

function fmtMoney(amount, decimals = 2) {
  const symbols = { USD: '$', EUR: '€', GBP: '£', JPY: '¥' };
  const data = loadData();
  const symbol = symbols[data.meta.currency] || '$';
  const sign = amount < 0 ? '-' : '';
  return sign + symbol + Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
function fmtDate(d) { return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
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

function populateCategorySelect(select, data, { includeAll = false } = {}) {
  const current = select.value;
  select.innerHTML =
    (includeAll ? '<option value="all">All categories</option>' : '') +
    data.categories.map(c => `<option value="${c.id}">${escapeHtml(c.label)}</option>`).join('') +
    `<option value="income">Income</option>`;
  if ([...select.options].some(o => o.value === current)) select.value = current;
}

/* ---- AI helpers ---- */
async function askAI(messages) {
  const data = loadData();
  const key = data.meta.openaiKey;
  if (!key) { showToast('Add your OpenAI API key in Settings first.'); return null; }
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({ model: 'gpt-4o-mini', messages, temperature: 0.6 }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Request failed');
    }
    const json = await res.json();
    return json.choices[0].message.content.trim();
  } catch (err) {
    showToast('AI request failed — check your key, or your browser may be blocking it (CORS).');
    return null;
  }
}

function financeSummary(data) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  const txns = data.transactions.filter(t => { const d = new Date(t.date); return d >= start && d <= end; });
  const income = txns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expenses = txns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const balance = data.transactions.reduce((s, t) => s + (t.type === 'income' ? t.amount : -t.amount), 0);
  const budgetLines = Object.entries(data.budgets)
    .map(([cat, limit]) => {
      const spent = txns.filter(t => t.category === cat && t.type === 'expense').reduce((s, t) => s + t.amount, 0);
      return `${catInfo(data, cat).label}: budget $${limit}, spent $${spent.toFixed(0)} so far this month`;
    }).join('; ');
  const goalLines = data.goals.map(g => `${g.name}: $${g.current} saved of $${g.target} goal, due ${g.deadline}`).join('; ');
  return `Current total balance: $${balance.toFixed(0)}. This month so far — income: $${income.toFixed(0)}, expenses: $${expenses.toFixed(0)}. Budgets — ${budgetLines || 'none set'}. Goals — ${goalLines || 'none'}.`;
}

/* ================= Transactions-specific ================= */

let filters = { search: '', category: 'all', type: 'all' };

function getFiltered() {
  const data = loadData();
  let list = data.transactions.slice();
  if (filters.search.trim()) {
    const q = filters.search.trim().toLowerCase();
    list = list.filter(t => t.description.toLowerCase().includes(q) || (t.notes || '').toLowerCase().includes(q));
  }
  if (filters.category !== 'all') list = list.filter(t => t.category === filters.category);
  if (filters.type !== 'all') list = list.filter(t => t.type === filters.type);
  return list;
}

function renderTable() {
  const list = getFiltered();
  const body = document.getElementById('table-body');

  if (!list.length) {
    body.innerHTML = `<tr class="empty-row"><td colspan="5">No transactions match your filters.</td></tr>`;
    return;
  }

  const data = loadData();
  body.innerHTML = list.map(t => {
    const cat = catInfo(data, t.category);
    const isIncome = t.type === 'income';
    return `
      <tr data-id="${t.id}">
        <td><span class="cat-pill"><span class="cat-dot" style="background:${cat.color}22;color:${cat.color}">${cat.label[0]}</span>${cat.label}</span></td>
        <td>${escapeHtml(t.description)}${t.notes ? `<div style="color:var(--text-faint); font-size:11.5px; margin-top:2px;">${escapeHtml(t.notes)}</div>` : ''}</td>
        <td>${fmtDate(t.date)}</td>
        <td class="amt-col mono" style="color:${isIncome ? 'var(--success)' : 'var(--text)'}">${isIncome ? '+' : '-'}${fmtMoney(t.amount)}</td>
        <td>
          <div class="row-actions">
            <button class="btn-icon act-edit" data-id="${t.id}" title="Edit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg></button>
            <button class="btn-icon act-delete" data-id="${t.id}" title="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg></button>
          </div>
        </td>
      </tr>`;
  }).join('');
}

function openModal(txn) {
  const data = loadData();
  document.getElementById('txn-form').reset();
  document.getElementById('txn-id').value = txn ? txn.id : '';
  document.getElementById('modal-title').textContent = txn ? 'Edit Transaction' : 'Add Transaction';
  document.getElementById('txn-amount').value = txn ? txn.amount : '';
  document.getElementById('txn-description').value = txn ? txn.description : '';
  populateCategorySelect(document.getElementById('txn-category'), data);
  document.getElementById('txn-category').value = txn ? txn.category : (data.categories[0] ? data.categories[0].id : 'income');
  document.getElementById('txn-date').value = txn ? txn.date : new Date().toISOString().slice(0, 10);
  document.getElementById('txn-notes').value = txn ? (txn.notes || '') : '';
  const type = txn ? txn.type : 'expense';
  document.querySelectorAll('.type-btn').forEach(b => b.classList.toggle('active', b.dataset.type === type));
  document.getElementById('txn-ai-tip').textContent = '';
  document.getElementById('modal-overlay').hidden = false;
}
function closeModal() { document.getElementById('modal-overlay').hidden = true; }

function wireTxnAIButton() {
  document.getElementById('txn-ai-btn').addEventListener('click', async () => {
    const amount = parseFloat(document.getElementById('txn-amount').value);
    const description = document.getElementById('txn-description').value.trim();
    const category = document.getElementById('txn-category').value;
    const tip = document.getElementById('txn-ai-tip');
    if (!amount || !description) { showToast('Enter an amount and description first.'); return; }

    tip.textContent = 'Thinking…';
    const data = loadData();
    const reply = await askAI([
      { role: 'system', content: `You are a concise personal budgeting assistant. In 1-2 short sentences, tell the user whether a purchase is reasonable given their finances. Here is their financial picture: ${financeSummary(data)}` },
      { role: 'user', content: `I'm about to spend $${amount} on "${description}" (category: ${catInfo(data, category).label}). Is that a reasonable amount right now?` },
    ]);
    tip.textContent = reply || '';
  });
}

function wireTransactions() {
  document.getElementById('add-transaction-btn').addEventListener('click', () => openModal(null));
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-overlay').addEventListener('click', (e) => { if (e.target.id === 'modal-overlay') closeModal(); });
  wireTxnAIButton();

  document.querySelectorAll('.type-btn').forEach(btn => {
    btn.addEventListener('click', () => document.querySelectorAll('.type-btn').forEach(b => b.classList.toggle('active', b === btn)));
  });

  populateCategorySelect(document.getElementById('filter-category'), loadData(), { includeAll: true });

  document.getElementById('search-input').addEventListener('input', (e) => { filters.search = e.target.value; renderTable(); });
  document.getElementById('filter-category').addEventListener('change', (e) => { filters.category = e.target.value; renderTable(); });
  document.getElementById('filter-type').addEventListener('change', (e) => { filters.type = e.target.value; renderTable(); });

  document.getElementById('txn-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('txn-id').value;
    const type = document.querySelector('.type-btn.active').dataset.type;
    const amount = parseFloat(document.getElementById('txn-amount').value);
    const description = document.getElementById('txn-description').value.trim();
    if (!description || !amount || amount <= 0) { showToast('Enter a valid amount and description.'); return; }

    const data = loadData();
    const payload = {
      type, category: document.getElementById('txn-category').value, description,
      amount: Math.round(amount * 100) / 100,
      date: document.getElementById('txn-date').value,
      notes: document.getElementById('txn-notes').value.trim(),
    };

    if (id) {
      const idx = data.transactions.findIndex(t => t.id === id);
      data.transactions[idx] = { ...data.transactions[idx], ...payload };
      showToast('Transaction updated');
    } else {
      data.transactions.unshift({ id: uid(), ...payload });
      showToast('Transaction added');
    }
    saveData(data);
    closeModal();
    renderTable();
  });

  document.getElementById('table-body').addEventListener('click', (e) => {
    const editBtn = e.target.closest('.act-edit');
    const delBtn = e.target.closest('.act-delete');
    if (editBtn) {
      const data = loadData();
      const t = data.transactions.find(t => t.id === editBtn.dataset.id);
      if (t) openModal(t);
    } else if (delBtn) {
      if (confirm('Delete this transaction?')) {
        const data = loadData();
        data.transactions = data.transactions.filter(t => t.id !== delBtn.dataset.id);
        saveData(data);
        renderTable();
        showToast('Transaction deleted');
      }
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  wireTransactions();
  renderTable();
});
