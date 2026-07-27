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

function fmtMoney(amount, decimals = 0) {
  const symbols = { USD: '$', EUR: '€', GBP: '£', JPY: '¥' };
  const data = loadData();
  const symbol = symbols[data.meta.currency] || '$';
  return symbol + Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
function fmtDeadline(d) { return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
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

/* ================= Goals-specific ================= */

const RING_CIRCUMFERENCE = 2 * Math.PI * 55; // r=55

function renderGoals() {
  const data = loadData();
  const grid = document.getElementById('goals-grid');

  if (!data.goals.length) {
    grid.innerHTML = `<div class="empty-state">No goals yet — create your first one.</div>`;
    return;
  }

  grid.innerHTML = data.goals.map(g => {
    const pct = Math.min(100, Math.round((g.current / g.target) * 100));
    const offset = RING_CIRCUMFERENCE - (pct / 100) * RING_CIRCUMFERENCE;
    const complete = g.current >= g.target;
    const color = complete ? '#34D399' : '#6C7CFF';
    const daysLeft = Math.ceil((new Date(g.deadline) - new Date()) / 86400000);
    return `
      <div class="card goal-card" data-id="${g.id}">
        <div class="goal-ring-wrap">
          <svg viewBox="0 0 130 130" class="goal-ring">
            <circle cx="65" cy="65" r="55" class="goal-ring-track"/>
            <circle cx="65" cy="65" r="55" class="goal-ring-fill" style="stroke:${color}; stroke-dasharray:${RING_CIRCUMFERENCE}; stroke-dashoffset:${offset}"/>
          </svg>
          <div class="goal-ring-center">
            <span class="goal-ring-pct">${pct}%</span>
          </div>
        </div>
        <div class="goal-name">${escapeHtml(g.name)}</div>
        <div class="goal-deadline">${complete ? 'Goal reached' : daysLeft >= 0 ? `${daysLeft} days left · ${fmtDeadline(g.deadline)}` : `Was due ${fmtDeadline(g.deadline)}`}</div>
        <div class="goal-numbers"><b>${fmtMoney(g.current)}</b> of <b>${fmtMoney(g.target)}</b></div>
        <div class="goal-actions">
          <button class="btn-icon act-edit" data-id="${g.id}" title="Edit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg></button>
          <button class="btn-icon act-delete" data-id="${g.id}" title="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg></button>
        </div>
      </div>`;
  }).join('');
}

function openModal(goal) {
  document.getElementById('goal-form').reset();
  document.getElementById('goal-id').value = goal ? goal.id : '';
  document.getElementById('modal-title').textContent = goal ? 'Edit Goal' : 'New Goal';
  document.getElementById('goal-name').value = goal ? goal.name : '';
  document.getElementById('goal-target').value = goal ? goal.target : '';
  document.getElementById('goal-current').value = goal ? goal.current : '0';
  document.getElementById('goal-deadline').value = goal ? goal.deadline : '';
  document.getElementById('goal-ai-tip').textContent = '';
  document.getElementById('modal-overlay').hidden = false;
}
function closeModal() { document.getElementById('modal-overlay').hidden = true; }

function wireGoalSuggest() {
  document.getElementById('goal-suggest-btn').addEventListener('click', async () => {
    const name = document.getElementById('goal-name').value.trim();
    const tip = document.getElementById('goal-ai-tip');
    if (!name) { showToast('Enter a goal name first.'); return; }

    tip.textContent = 'Thinking…';
    const data = loadData();
    const reply = await askAI([
      { role: 'system', content: `You are a concise personal budgeting assistant. Suggest a reasonable savings target for a goal, given the user's finances: ${financeSummary(data)}. Reply with a short sentence of reasoning, then on its own final line just the number with no dollar sign or commas, like: 1500` },
      { role: 'user', content: `What's a reasonable target amount for a goal called "${name}"?` },
    ]);
    if (!reply) return;
    tip.textContent = reply;
    const match = reply.match(/([\d,]+(?:\.\d+)?)\s*$/);
    if (match) document.getElementById('goal-target').value = parseFloat(match[1].replace(/,/g, ''));
  });
}

function wireGoals() {
  document.getElementById('add-goal-btn').addEventListener('click', () => openModal(null));
  document.getElementById('modal-close').addEventListener('click', closeModal);
  wireGoalSuggest();
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-overlay').addEventListener('click', (e) => { if (e.target.id === 'modal-overlay') closeModal(); });

  document.getElementById('goal-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('goal-id').value;
    const name = document.getElementById('goal-name').value.trim();
    const target = parseFloat(document.getElementById('goal-target').value);
    const current = parseFloat(document.getElementById('goal-current').value);
    const deadline = document.getElementById('goal-deadline').value;
    if (!name || !target || target <= 0) { showToast('Enter a goal name and target amount.'); return; }

    const data = loadData();
    if (id) {
      const idx = data.goals.findIndex(g => g.id === id);
      data.goals[idx] = { ...data.goals[idx], name, target, current, deadline };
      showToast('Goal updated');
    } else {
      data.goals.push({ id: uid('goal'), name, target, current, deadline });
      showToast('Goal created');
    }
    saveData(data);
    closeModal();
    renderGoals();
  });

  document.getElementById('goals-grid').addEventListener('click', (e) => {
    const editBtn = e.target.closest('.act-edit');
    const delBtn = e.target.closest('.act-delete');
    if (editBtn) {
      const data = loadData();
      const g = data.goals.find(g => g.id === editBtn.dataset.id);
      if (g) openModal(g);
    } else if (delBtn) {
      if (confirm('Delete this goal?')) {
        const data = loadData();
        data.goals = data.goals.filter(g => g.id !== delBtn.dataset.id);
        saveData(data);
        renderGoals();
        showToast('Goal deleted');
      }
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  wireGoals();
  renderGoals();
});
