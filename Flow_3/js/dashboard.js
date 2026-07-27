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

function fmtMoney(amount, decimals = 0) {
  const symbols = { USD: '$', EUR: '€', GBP: '£', JPY: '¥' };
  const data = loadData();
  const symbol = symbols[data.meta.currency] || '$';
  const sign = amount < 0 ? '-' : '';
  return sign + symbol + Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
function fmtDate(d) { return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
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

const COLOR_THEMES = ['blue', 'violet', 'emerald', 'sunset', 'rose', 'cyan'];
function applyTheme(data) {
  document.body.classList.toggle('light', data.meta.theme === 'light');
  COLOR_THEMES.forEach(t => document.body.classList.remove('theme-' + t));
  const ct = data.meta.colorTheme || 'blue';
  if (ct !== 'blue') document.body.classList.add('theme-' + ct);
}
function initTheme() {
  applyTheme(loadData());
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.addEventListener('click', () => {
    const isLight = document.body.classList.toggle('light');
    const d = loadData();
    d.meta.theme = isLight ? 'light' : 'dark';
    saveData(d);
  });
}

function populateCategorySelect(select, data) {
  const current = select.value;
  select.innerHTML = data.categories.map(c => `<option value="${c.id}">${escapeHtml(c.label)}</option>`).join('')
    + `<option value="income">Income</option>`;
  if ([...select.options].some(o => o.value === current)) select.value = current;
}

/* ================= Dashboard-specific ================= */

function monthRange(date = new Date()) {
  return { start: new Date(date.getFullYear(), date.getMonth(), 1), end: new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59) };
}

function monthSummary(data, date = new Date()) {
  const { start, end } = monthRange(date);
  const txns = data.transactions.filter(t => { const d = new Date(t.date); return d >= start && d <= end; });
  const income = txns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expenses = txns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  return { income, expenses, net: income - expenses };
}

function totalBalance(data) {
  return data.transactions.reduce((s, t) => s + (t.type === 'income' ? t.amount : -t.amount), 0);
}

let spendChart;

function renderDashboard() {
  const data = loadData();
  const summary = monthSummary(data);
  const balance = totalBalance(data);

  document.getElementById('balance-value').textContent = fmtMoney(balance);
  const sub = document.getElementById('balance-sub');
  sub.textContent = `${summary.net >= 0 ? '+' : '-'}${fmtMoney(Math.abs(summary.net))} this month`;
  sub.className = 'balance-sub' + (summary.net < 0 ? ' negative' : '');

  document.getElementById('stat-income').textContent = fmtMoney(summary.income);
  document.getElementById('stat-expenses').textContent = fmtMoney(summary.expenses);
  document.getElementById('stat-savings').textContent = fmtMoney(summary.net);

  // Recent transactions
  const recent = data.transactions.slice(0, 6);
  document.getElementById('recent-list').innerHTML = recent.length ? recent.map(t => {
    const cat = catInfo(data, t.category);
    const isIncome = t.type === 'income';
    return `
      <div class="txn-row">
        <span class="txn-dot" style="background:${cat.color}22;color:${cat.color}">${cat.label[0]}</span>
        <div class="txn-info">
          <div class="txn-desc">${escapeHtml(t.description)}</div>
          <div class="txn-meta">${cat.label} · ${fmtDate(t.date)}</div>
        </div>
        <div class="txn-amt ${isIncome ? 'income' : ''}">${isIncome ? '+' : '-'}${fmtMoney(t.amount, 2)}</div>
      </div>`;
  }).join('') : `<p style="color:var(--text-faint); font-size:13px;">No transactions yet.</p>`;

  // Spending by category (this month), top 5
  const { start, end } = monthRange();
  const byCat = {};
  data.transactions.filter(t => t.type === 'expense' && new Date(t.date) >= start && new Date(t.date) <= end)
    .forEach(t => { byCat[t.category] = (byCat[t.category] || 0) + t.amount; });
  const breakdown = Object.entries(byCat).map(([cat, amt]) => ({ cat, amt, ...catInfo(data, cat) }))
    .sort((a, b) => b.amt - a.amt).slice(0, 5);

  const ctx = document.getElementById('spend-chart').getContext('2d');
  if (spendChart) spendChart.destroy();
  spendChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: breakdown.map(b => b.label),
      datasets: [{ data: breakdown.map(b => b.amt), backgroundColor: breakdown.map(b => b.color), borderRadius: 6, maxBarThickness: 40 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => fmtMoney(c.parsed.y) } } },
      scales: {
        x: { grid: { display: false } },
        y: { grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { callback: (v) => fmtMoney(v) } },
      },
    },
  });
}

function openAddModal() {
  document.getElementById('txn-form').reset();
  populateCategorySelect(document.getElementById('txn-category'), loadData());
  document.getElementById('txn-date').value = new Date().toISOString().slice(0, 10);
  document.querySelectorAll('.type-btn').forEach(b => b.classList.toggle('active', b.dataset.type === 'expense'));
  document.getElementById('txn-ai-tip').textContent = '';
  document.getElementById('modal-overlay').hidden = false;
}
function closeAddModal() { document.getElementById('modal-overlay').hidden = true; }

function addChatMessage(role, text) {
  const log = document.getElementById('ai-chat-log');
  const bubble = document.createElement('div');
  bubble.style.cssText = role === 'user'
    ? 'align-self:flex-end; background:var(--accent-bg); color:var(--accent-soft); padding:9px 13px; border-radius:12px; font-size:13.5px; max-width:80%;'
    : 'align-self:flex-start; background:var(--panel); padding:9px 13px; border-radius:12px; font-size:13.5px; max-width:80%; white-space:pre-wrap;';
  bubble.textContent = text;
  log.appendChild(bubble);
  log.scrollTop = log.scrollHeight;
}

let chatHistory = [];

function wireAIChat() {
  const send = async () => {
    const input = document.getElementById('ai-chat-input');
    const question = input.value.trim();
    if (!question) return;
    input.value = '';
    addChatMessage('user', question);

    const data = loadData();
    if (chatHistory.length === 0) {
      chatHistory.push({ role: 'system', content: `You are a friendly, concise personal budgeting assistant. Give short, practical answers. Here is the user's current financial picture: ${financeSummary(data)}` });
    }
    chatHistory.push({ role: 'user', content: question });

    const thinking = document.createElement('div');
    thinking.textContent = 'Thinking…';
    thinking.style.cssText = 'align-self:flex-start; color:var(--text-faint); font-size:13px;';
    document.getElementById('ai-chat-log').appendChild(thinking);

    const reply = await askAI(chatHistory);
    thinking.remove();
    if (reply) {
      chatHistory.push({ role: 'assistant', content: reply });
      addChatMessage('assistant', reply);
    }
  };

  document.getElementById('ai-chat-send').addEventListener('click', send);
  document.getElementById('ai-chat-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
}

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

function wireDashboard() {
  document.getElementById('add-transaction-btn').addEventListener('click', openAddModal);
  document.getElementById('modal-close').addEventListener('click', closeAddModal);
  document.getElementById('modal-cancel').addEventListener('click', closeAddModal);
  document.getElementById('modal-overlay').addEventListener('click', (e) => { if (e.target.id === 'modal-overlay') closeAddModal(); });

  wireAIChat();
  wireTxnAIButton();

  document.querySelectorAll('.type-btn').forEach(btn => {
    btn.addEventListener('click', () => document.querySelectorAll('.type-btn').forEach(b => b.classList.toggle('active', b === btn)));
  });

  document.getElementById('txn-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const type = document.querySelector('.type-btn.active').dataset.type;
    const amount = parseFloat(document.getElementById('txn-amount').value);
    const description = document.getElementById('txn-description').value.trim();
    if (!description || !amount || amount <= 0) { showToast('Enter a valid amount and description.'); return; }

    const data = loadData();
    data.transactions.unshift({
      id: uid(), type,
      category: document.getElementById('txn-category').value,
      description,
      amount: Math.round(amount * 100) / 100,
      date: document.getElementById('txn-date').value,
      notes: document.getElementById('txn-notes').value.trim(),
    });
    saveData(data);
    closeAddModal();
    renderDashboard();
    showToast('Transaction added');
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  wireDashboard();
  renderDashboard();
});
