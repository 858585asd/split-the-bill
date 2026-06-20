// 分帳 App — 主邏輯

const GAS_URL_KEY = 'stb_gas_url';
let gasUrl = null;
let members = [];

// ── 工具函式 ────────────────────────────────────────────────

function $(id) { return document.getElementById(id); }

function show(id) { $(id).classList.remove('hidden'); }
function hide(id) { $(id).classList.add('hidden'); }

function setError(id, msg) {
  const el = $(id);
  el.textContent = msg;
  el.classList.remove('hidden');
}
function clearError(id) {
  $(id).textContent = '';
  $(id).classList.add('hidden');
}

function formatMoney(n) {
  return '$' + parseFloat(n).toFixed(0);
}

function todayStr() {
  return new Date().toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

// ── 初始化 ──────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  const saved = localStorage.getItem(GAS_URL_KEY);
  if (saved) {
    gasUrl = saved;
    showMainUI();
  } else {
    showSetupScreen();
  }
});

// ── 設定畫面 ────────────────────────────────────────────────

function showSetupScreen() {
  show('setup-screen');
  hide('main-ui');
}

function showMainUI() {
  hide('setup-screen');
  show('main-ui');
  loadMembers();
  switchTab('expenses');
}

$('setup-save-btn').addEventListener('click', async () => {
  const url = $('gas-url-input').value.trim();
  clearError('setup-error');

  if (!url) {
    setError('setup-error', '請輸入 GAS 網址');
    return;
  }

  const btn = $('setup-save-btn');
  btn.textContent = '測試中…';
  btn.disabled = true;

  try {
    await api.ping(url);
    gasUrl = url;
    localStorage.setItem(GAS_URL_KEY, url);
    showMainUI();
  } catch (err) {
    setError('setup-error', '連線失敗：' + err.message);
  } finally {
    btn.textContent = '測試並儲存';
    btn.disabled = false;
  }
});

$('reset-url-btn').addEventListener('click', () => {
  if (!confirm('確定要重設 GAS 連結嗎？')) return;
  localStorage.removeItem(GAS_URL_KEY);
  gasUrl = null;
  members = [];
  showSetupScreen();
});

// ── Tab 切換 ─────────────────────────────────────────────────

document.querySelectorAll('.nav-tab').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

function switchTab(tab) {
  document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
  document.querySelector(`.nav-tab[data-tab="${tab}"]`).classList.add('active');

  document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
  $(`tab-${tab}`).classList.remove('hidden');

  if (tab === 'expenses') loadExpenses();
  if (tab === 'add')      renderAddExpenseForm();
  if (tab === 'settle')   loadSettlement();
  if (tab === 'members')  renderMembersList();
}

// ── 成員 ────────────────────────────────────────────────────

async function loadMembers() {
  try {
    const res = await api.getMembers(gasUrl);
    members = res.members || [];
  } catch (err) {
    members = [];
  }
}

function renderMembersList() {
  const container = $('members-list');
  container.innerHTML = '';
  clearError('members-error');

  if (members.length === 0) {
    container.innerHTML = '<p class="empty-msg">還沒有任何成員</p>';
    return;
  }

  members.forEach(name => {
    const row = document.createElement('div');
    row.className = 'member-row';
    row.innerHTML = `
      <span class="member-name">${escHtml(name)}</span>
      <button class="btn btn-danger btn-sm" data-name="${escHtml(name)}">刪除</button>
    `;
    row.querySelector('button').addEventListener('click', () => deleteMember(name));
    container.appendChild(row);
  });
}

$('add-member-btn').addEventListener('click', async () => {
  const input = $('new-member-input');
  const name = input.value.trim();
  clearError('members-error');

  if (!name) {
    setError('members-error', '請輸入姓名');
    return;
  }

  const btn = $('add-member-btn');
  btn.disabled = true;

  try {
    await api.addMember(gasUrl, name);
    input.value = '';
    await loadMembers();
    renderMembersList();
    renderPayerDropdown();
    renderSplitsTable();
  } catch (err) {
    setError('members-error', '新增失敗：' + err.message);
  } finally {
    btn.disabled = false;
  }
});

$('new-member-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') $('add-member-btn').click();
});

async function deleteMember(name) {
  if (!confirm(`確定要刪除成員「${name}」嗎？`)) return;

  try {
    await api.deleteMember(gasUrl, name);
    await loadMembers();
    renderMembersList();
    renderPayerDropdown();
    renderSplitsTable();
  } catch (err) {
    setError('members-error', '刪除失敗：' + err.message);
  }
}

// ── 帳目明細 ─────────────────────────────────────────────────

async function loadExpenses() {
  $('expenses-loading').textContent = '載入中…';
  show('expenses-loading');
  hide('expenses-error');
  hide('expenses-empty');
  $('expenses-list').innerHTML = '';

  try {
    const [expRes, splitRes] = await Promise.all([
      api.getExpenses(gasUrl),
      api.getSplits(gasUrl)
    ]);

    const expenses = expRes.expenses || [];
    const splits   = splitRes.splits   || [];
    hide('expenses-loading');

    if (expenses.length === 0) {
      show('expenses-empty');
      return;
    }

    expenses.sort((a, b) => (b.date > a.date ? 1 : -1));
    const container = $('expenses-list');

    expenses.forEach(exp => {
      const mySplits = splits.filter(s => String(s.expense_id) === String(exp.id));
      const card = document.createElement('div');
      card.className = 'expense-card';
      card.innerHTML = `
        <div class="expense-header">
          <div class="expense-info">
            <span class="expense-desc">${escHtml(exp.description)}</span>
            <span class="expense-meta">${escHtml(exp.date)} · 由 ${escHtml(exp.payer)} 付款</span>
          </div>
          <div class="expense-right">
            <span class="expense-total">${formatMoney(exp.total)}</span>
            <button class="btn btn-danger btn-sm delete-exp-btn" data-id="${escHtml(exp.id)}">刪除</button>
          </div>
        </div>
        <div class="expense-splits">
          ${mySplits.map(s =>
            `<span class="split-tag">${escHtml(s.person)}: ${formatMoney(s.amount)}</span>`
          ).join('')}
        </div>
      `;
      card.querySelector('.delete-exp-btn').addEventListener('click', () => deleteExpense(exp.id));
      container.appendChild(card);
    });

  } catch (err) {
    hide('expenses-loading');
    setError('expenses-error', '載入失敗：' + err.message);
  }
}

$('refresh-expenses-btn').addEventListener('click', loadExpenses);

async function deleteExpense(id) {
  if (!confirm('確定要刪除這筆花費嗎？')) return;
  try {
    await api.deleteExpense(gasUrl, id);
    await loadExpenses();
  } catch (err) {
    setError('expenses-error', '刪除失敗：' + err.message);
  }
}

// ── 新增花費 ─────────────────────────────────────────────────

function renderPayerDropdown() {
  const sel = $('exp-payer');
  sel.innerHTML = '<option value="">請選擇付款人</option>';
  members.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    sel.appendChild(opt);
  });
}

function renderSplitsTable() {
  const container = $('splits-table');
  container.innerHTML = '';

  if (members.length === 0) {
    container.innerHTML = '<p class="empty-msg">請先在「成員」頁面新增成員</p>';
    return;
  }

  members.forEach(name => {
    const row = document.createElement('div');
    row.className = 'split-input-row';
    row.innerHTML = `
      <label class="split-label">${escHtml(name)}</label>
      <div class="split-input-wrap">
        <span class="currency-sign">$</span>
        <input type="number" class="split-amount" data-person="${escHtml(name)}"
               min="0" step="1" placeholder="0" />
      </div>
    `;
    container.appendChild(row);
  });

  container.querySelectorAll('.split-amount').forEach(input => {
    input.addEventListener('input', updateSplitsTotal);
  });
}

function updateSplitsTotal() {
  let total = 0;
  document.querySelectorAll('.split-amount').forEach(input => {
    total += parseFloat(input.value) || 0;
  });
  $('splits-total').textContent = formatMoney(total);
}

function renderAddExpenseForm() {
  renderPayerDropdown();
  renderSplitsTable();
  updateSplitsTotal();
}

$('add-expense-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError('add-expense-error');

  const description = $('exp-description').value.trim();
  const payer = $('exp-payer').value;

  if (!description) { setError('add-expense-error', '請輸入項目名稱'); return; }
  if (!payer)        { setError('add-expense-error', '請選擇付款人'); return; }

  const splits = [];
  document.querySelectorAll('.split-amount').forEach(input => {
    const amount = parseFloat(input.value);
    if (amount > 0) splits.push({ person: input.dataset.person, amount: Math.round(amount * 100) / 100 });
  });

  if (splits.length === 0) { setError('add-expense-error', '請至少輸入一人的分攤金額'); return; }

  const total = splits.reduce((sum, s) => sum + s.amount, 0);

  const data = {
    id: crypto.randomUUID(),
    date: todayStr(),
    description,
    payer,
    total: Math.round(total * 100) / 100,
    splits
  };

  const btn = $('add-expense-btn');
  btn.textContent = '新增中…';
  btn.disabled = true;

  try {
    await api.addExpense(gasUrl, data);
    $('add-expense-form').reset();
    renderSplitsTable();
    updateSplitsTotal();
    switchTab('expenses');
  } catch (err) {
    setError('add-expense-error', '新增失敗：' + err.message);
  } finally {
    btn.textContent = '新增花費';
    btn.disabled = false;
  }
});

// ── 結算 ─────────────────────────────────────────────────────

async function loadSettlement() {
  show('settle-loading');
  hide('settle-error');
  hide('settle-content');

  try {
    const [expRes, splitRes, settleRes] = await Promise.all([
      api.getExpenses(gasUrl),
      api.getSplits(gasUrl),
      api.getSettlements(gasUrl)
    ]);

    const expenses    = expRes.expenses       || [];
    const splits      = splitRes.splits       || [];
    const settlements = settleRes.settlements || [];

    hide('settle-loading');
    show('settle-content');

    const { net, transactions } = calculateSettlements(members, expenses, splits, settlements);

    renderTransactions(transactions);
    renderBalances(net);
    renderSettlementHistory(settlements);

  } catch (err) {
    hide('settle-loading');
    setError('settle-error', '載入失敗：' + err.message);
  }
}

function renderTransactions(transactions) {
  const list = $('transactions-list');
  list.innerHTML = '';
  hide('settle-all-clear');

  if (transactions.length === 0) {
    show('settle-all-clear');
    return;
  }

  transactions.forEach(tx => {
    const row = document.createElement('div');
    row.className = 'transaction-row';
    row.innerHTML = `
      <div class="tx-info">
        <span class="tx-from">${escHtml(tx.from)}</span>
        <span class="tx-arrow">→</span>
        <span class="tx-to">${escHtml(tx.to)}</span>
        <span class="tx-amount">${formatMoney(tx.amount)}</span>
      </div>
      <button class="btn btn-success btn-sm mark-paid-btn">標記已還款</button>
    `;
    row.querySelector('.mark-paid-btn').addEventListener('click', () => markAsPaid(tx));
    list.appendChild(row);
  });
}

async function markAsPaid(tx) {
  if (!confirm(`確定 ${tx.from} 已還給 ${tx.to} ${formatMoney(tx.amount)} 嗎？`)) return;

  const data = {
    id: crypto.randomUUID(),
    date: todayStr(),
    from_person: tx.from,
    to_person: tx.to,
    amount: tx.amount
  };

  try {
    await api.addSettlement(gasUrl, data);
    await loadSettlement();
  } catch (err) {
    setError('settle-error', '記錄失敗：' + err.message);
  }
}

function renderBalances(net) {
  const list = $('balance-list');
  list.innerHTML = '';

  Object.entries(net).forEach(([name, balance]) => {
    const row = document.createElement('div');
    row.className = 'balance-row';
    const label = balance > 0.005 ? `應收 ${formatMoney(balance)}` :
                  balance < -0.005 ? `應付 ${formatMoney(-balance)}` : '已結清';
    const cls = balance > 0.005 ? 'positive' : balance < -0.005 ? 'negative' : 'zero';
    row.innerHTML = `
      <span class="balance-name">${escHtml(name)}</span>
      <span class="balance-amount ${cls}">${label}</span>
    `;
    list.appendChild(row);
  });
}

function renderSettlementHistory(settlements) {
  const section = $('settle-history-section');
  const list    = $('settlements-history');
  list.innerHTML = '';

  if (settlements.length === 0) {
    hide('settle-history-section');
    return;
  }

  show('settle-history-section');
  [...settlements].reverse().forEach(s => {
    const row = document.createElement('div');
    row.className = 'history-row';
    row.innerHTML = `
      <span class="history-date">${escHtml(s.date)}</span>
      <span>${escHtml(s.from_person)} → ${escHtml(s.to_person)}</span>
      <span class="history-amount">${formatMoney(s.amount)}</span>
    `;
    list.appendChild(row);
  });
}

$('refresh-settle-btn').addEventListener('click', loadSettlement);

// ── 安全工具 ─────────────────────────────────────────────────

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
