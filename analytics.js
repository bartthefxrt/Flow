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
  return symbol + Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

const COLOR_THEMES = ['blue', 'violet', 'emerald', 'sunset', 'rose', 'cyan'];
function applyTheme(data) {
  document.body.classList.toggle('light', data.meta.theme === 'light');
  COLOR_THEMES.forEach(t => document.body.classList.remove('theme-' + t));
  const ct = data.meta.colorTheme || 'blue';
  if (ct !== 'blue') document.body.classList.add('theme-' + ct);
}
function initTheme() { applyTheme(loadData()); }

/* ================= Analytics-specific ================= */

function monthKey(date) { return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0'); }

function monthlyTotals(data, months = 6) {
  const today = new Date();
  const out = [];
  for (let m = months - 1; m >= 0; m--) {
    const d = new Date(today.getFullYear(), today.getMonth() - m, 1);
    const start = d, end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
    const txns = data.transactions.filter(t => { const td = new Date(t.date); return td >= start && td <= end; });
    out.push({
      label: d.toLocaleString('en-US', { month: 'short' }),
      income: txns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0),
      expenses: txns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0),
    });
  }
  return out;
}

function categoryBreakdownThisMonth(data) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  const byCat = {};
  data.transactions.filter(t => t.type === 'expense' && new Date(t.date) >= start && new Date(t.date) <= end)
    .forEach(t => { byCat[t.category] = (byCat[t.category] || 0) + t.amount; });
  return Object.entries(byCat).map(([cat, amt]) => ({ cat, amt, ...catInfo(data, cat) })).sort((a, b) => b.amt - a.amt);
}

let incomeExpenseChart, categoryChart, trendChart;

function renderAnalytics() {
  const data = loadData();
  const trend = monthlyTotals(data, 6);

  // Income vs Expenses
  if (incomeExpenseChart) incomeExpenseChart.destroy();
  incomeExpenseChart = new Chart(document.getElementById('income-expense-chart').getContext('2d'), {
    type: 'bar',
    data: {
      labels: trend.map(t => t.label),
      datasets: [
        { label: 'Income', data: trend.map(t => t.income), backgroundColor: '#34D399', borderRadius: 6, maxBarThickness: 26 },
        { label: 'Expenses', data: trend.map(t => t.expenses), backgroundColor: '#F87171', borderRadius: 6, maxBarThickness: 26 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'top', align: 'end', labels: { boxWidth: 8, boxHeight: 8 } } },
      scales: {
        x: { grid: { display: false } },
        y: { grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { callback: (v) => fmtMoney(v) } },
      },
    },
  });

  // Category breakdown pie
  const breakdown = categoryBreakdownThisMonth(data);
  if (categoryChart) categoryChart.destroy();
  categoryChart = new Chart(document.getElementById('category-chart').getContext('2d'), {
    type: 'pie',
    data: {
      labels: breakdown.map(b => b.label),
      datasets: [{ data: breakdown.map(b => b.amt), backgroundColor: breakdown.map(b => b.color), borderColor: '#171C26', borderWidth: 2 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
    },
  });
  document.getElementById('category-legend').innerHTML = breakdown.length
    ? breakdown.map(b => `<div class="legend-row"><span class="legend-dot" style="background:${b.color}"></span><span class="name">${b.label}</span><span class="amt mono">${fmtMoney(b.amt)}</span></div>`).join('')
    : `<p style="color:var(--text-faint); font-size:13px;">No expenses recorded yet this month.</p>`;

  // Spending trend line
  if (trendChart) trendChart.destroy();
  const ctx = document.getElementById('trend-chart').getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 260);
  gradient.addColorStop(0, 'rgba(248,113,113,0.35)');
  gradient.addColorStop(1, 'rgba(248,113,113,0)');
  trendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: trend.map(t => t.label),
      datasets: [{ label: 'Total spending', data: trend.map(t => t.expenses), borderColor: '#F87171', backgroundColor: gradient, fill: true, tension: 0.4, pointRadius: 3 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false } },
        y: { grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { callback: (v) => fmtMoney(v) } },
      },
    },
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  renderAnalytics();
});
