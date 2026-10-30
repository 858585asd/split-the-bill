// 分帳 App — 主邏輯（Firebase 版）

let currentUser = null;
let currentTripCode = null;
let currentTripName = '';
let members = [];

// ── 工具函式 ────────────────────────────────────────────────

function $(id) { return document.getElementById(id); }
function show(id) { $(id).classList.remove('hidden'); }
function hide(id) { $(id).classList.add('hidden'); }
function setError(id, msg) { const el=$(id); el.textContent=msg; el.classList.remove('hidden'); }
function clearError(id) { const el=$(id); el.textContent=''; el.classList.add('hidden'); }
function showLoading() { show('loading-overlay'); }
function hideLoading() { hide('loading-overlay'); }
function formatMoney(n) { return '$' + parseFloat(n).toFixed(0); }
function todayStr() { return new Date().toLocaleDateString('zh-TW', {year:'numeric',month:'2-digit',day:'2-digit'}); }
function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── 自訂確認框 ───────────────────────────────────────────────

function customConfirm(message, { okText = '確定', danger = false } = {}) {
  return new Promise(resolve => {
    $('confirm-message').textContent = message;
    const okBtn = $('confirm-ok-btn');
    okBtn.textContent = okText;
    okBtn.className = `btn ${danger ? 'btn-danger' : 'btn-primary'}`;
    show('confirm-modal');

    const cleanup = () => {
      okBtn.removeEventListener('click', onOk);
      $('confirm-cancel-btn').removeEventListener('click', onCancel);
    };
    const onOk = () => { hide('confirm-modal'); cleanup(); resolve(true); };
    const onCancel = () => { hide('confirm-modal'); cleanup(); resolve(false); };

    okBtn.addEventListener('click', onOk);
    $('confirm-cancel-btn').addEventListener('click', onCancel);
  });
}

// ── 自訂輸入框 ───────────────────────────────────────────────

function customPrompt(message, defaultValue = '') {
  return new Promise(resolve => {
    $('prompt-message').textContent = message;
    const input = $('prompt-input');
    input.value = defaultValue;
    show('prompt-modal');
    setTimeout(() => { input.focus(); input.select(); }, 50);

    const okBtn = $('prompt-ok-btn');
    const cleanup = () => {
      okBtn.removeEventListener('click', onOk);
      $('prompt-cancel-btn').removeEventListener('click', onCancel);
      input.removeEventListener('keydown', onKeydown);
    };
    const onOk = () => { hide('prompt-modal'); cleanup(); resolve(input.value.trim()); };
    const onCancel = () => { hide('prompt-modal'); cleanup(); resolve(null); };
    const onKeydown = e => { if (e.key === 'Enter') onOk(); if (e.key === 'Escape') onCancel(); };

    okBtn.addEventListener('click', onOk);
    $('prompt-cancel-btn').addEventListener('click', onCancel);
    input.addEventListener('keydown', onKeydown);
  });
}

// ── 啟動 ─────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  if (!firebase.apps.length || firebase.app().options.projectId === 'YOUR_PROJECT_ID') {
    show('screen-config');
    return;
  }

  auth.onAuthStateChanged(user => {
    if (user) {
      currentUser = user;
      $('user-greeting').textContent = `歡迎，${user.displayName || user.email}`;
      hide('screen-login');
      const hash = location.hash.replace('#', '').trim().toUpperCase();
      if (hash.length === 6) {
        enterTrip(hash);
      } else {
        showTripList();
      }
    } else {
      currentUser = null;
      hide('screen-trips');
      hide('screen-trip');
      show('screen-login');
    }
  });
});

// ── 出遊列表 ─────────────────────────────────────────────────

function showTripList() {
  hide('screen-config');
  hide('screen-trip');
  show('screen-trips');
  hide('create-trip-form');
  show('recent-trips-section');
  renderRecentTrips();
}

async function renderRecentTrips() {
  show('trips-loading');
  hide('trips-empty');
  const list = $('trips-list');
  list.innerHTML = '';

  try {
    const trips = await dbOps.getUserTrips(currentUser.uid);
    hide('trips-loading');

    if (trips.length === 0) { show('trips-empty'); return; }
    hide('trips-empty');

    trips.forEach(t => {
      const isOwner = t.role === 'owner';
      const card = document.createElement('div');
      card.className = 'trip-card';
      card.innerHTML = `
        <div class="trip-card-info">
          <div class="trip-card-name-row">
            <span class="trip-card-name">${escHtml(t.name)}</span>
            <span class="trip-role-badge ${isOwner ? 'badge-owner' : 'badge-member'}">${isOwner ? '建立者' : '加入'}</span>
          </div>
          <span class="trip-card-code">代碼：${escHtml(t.code)}</span>
        </div>
        <div class="trip-card-actions">
          <button class="btn btn-primary btn-sm btn-enter">進入</button>
          <button class="btn btn-danger btn-sm btn-delete-trip">刪除</button>
        </div>
      `;
      card.querySelector('.btn-enter').addEventListener('click', () => enterTrip(t.code));
      card.querySelector('.btn-delete-trip').addEventListener('click', () => deleteTripFromList(t.code, t.name));
      list.appendChild(card);
    });
  } catch {
    hide('trips-loading');
    show('trips-empty');
  }
}

function signIn() {
  clearError('login-error');
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  auth.signInWithPopup(provider).catch(() => {
    setError('login-error', '登入失敗，請再試一次');
  });
}

async function signOut() {
  if (!await customConfirm('確定要登出嗎？')) return;
  currentUser = null;
  currentTripCode = null;
  currentTripName = '';
  members = [];
  location.hash = '';
  auth.signOut();
}

$('google-signin-btn').addEventListener('click', signIn);
$('signout-btn').addEventListener('click', signOut);

// 新增出遊
$('create-trip-btn').addEventListener('click', () => {
  hide('recent-trips-section');
  show('create-trip-form');
  $('trip-name-input').focus();
});

$('cancel-create-btn').addEventListener('click', () => {
  hide('create-trip-form');
  show('recent-trips-section');
  $('trip-name-input').value = '';
  clearError('create-trip-error');
  renderRecentTrips();
});

$('confirm-create-btn').addEventListener('click', async () => {
  const name = $('trip-name-input').value.trim();
  clearError('create-trip-error');
  if (!name) { setError('create-trip-error', '請輸入出遊名稱'); return; }

  const btn = $('confirm-create-btn');
  btn.disabled = true;
  btn.textContent = '建立中…';

  try {
    const code = await dbOps.createTrip(name);
    dbOps.saveUserTrip(currentUser.uid, code, name, 'owner');
    $('trip-name-input').value = '';
    enterTrip(code);
  } catch (err) {
    setError('create-trip-error', '建立失敗：' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '建立';
  }
});

$('trip-name-input').addEventListener('keydown', e => { if (e.key === 'Enter') $('confirm-create-btn').click(); });

// 加入出遊（輸入代碼）
$('join-trip-btn').addEventListener('click', async () => {
  const code = $('join-code-input').value.trim().toUpperCase();
  clearError('join-error');
  if (code.length !== 6) { setError('join-error', '代碼應為 6 碼'); return; }

  const btn = $('join-trip-btn');
  btn.disabled = true;
  btn.textContent = '查詢中…';

  try {
    const trip = await dbOps.getTrip(code);
    if (!trip) { setError('join-error', '找不到此出遊代碼'); return; }
    dbOps.saveUserTrip(currentUser.uid, code, trip.name, 'member');
    enterTrip(code);
  } catch (err) {
    setError('join-error', '查詢失敗：' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '加入';
  }
});

$('join-code-input').addEventListener('keydown', e => { if (e.key === 'Enter') $('join-trip-btn').click(); });

// ── 進入出遊 ─────────────────────────────────────────────────

async function enterTrip(code) {
  showLoading();
  try {
    const trip = await dbOps.getTrip(code);
    if (!trip) {
      hideLoading();
      alert('找不到出遊代碼：' + code);
      showTripList();
      return;
    }
    currentTripCode = code;
    currentTripName = trip.name;
    location.hash = code;
    await dbOps.saveUserTrip(currentUser.uid, code, trip.name);

    hide('screen-trips');
    show('screen-trip');
    $('trip-name-display').textContent = trip.name;
    $('trip-code-display').textContent = '代碼：' + code;

    await loadMembers();
    switchTab('expenses');
  } catch (err) {
    alert('載入失敗：' + err.message);
    showTripList();
  } finally {
    hideLoading();
  }
}

// 返回列表
$('back-btn').addEventListener('click', () => {
  currentTripCode = null;
  currentTripName = '';
  members = [];
  location.hash = '';
  showTripList();
});

// 分享
$('share-btn').addEventListener('click', () => {
  const url = location.origin + location.pathname + '#' + currentTripCode;
  navigator.clipboard.writeText(url).then(() => {
    showToast('已複製分享連結！朋友打開連結就能直接加入');
  }).catch(() => {
    showToast('出遊代碼：' + currentTripCode);
  });
});

function showToast(msg) {
  const toast = $('share-toast');
  toast.textContent = msg;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 3000);
}

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
  if (tab === 'settle')   loadSettlement();
  if (tab === 'members')  renderMembersList();
}

// ── 成員 ────────────────────────────────────────────────────

async function loadMembers() {
  try {
    members = await dbOps.getMembers(currentTripCode);
  } catch { members = []; }
}

function renderMembersList() {
  const container = $('members-list');
  container.innerHTML = '';
  clearError('members-error');

  if (members.length === 0) {
    container.innerHTML = '<p class="empty-msg">還沒有任何成員</p>';
    return;
  }

  members.forEach(m => {
    const row = document.createElement('div');
    row.className = 'member-row';
    row.innerHTML = `
      <span class="member-name">${escHtml(m.name)}</span>
      <div class="member-actions">
        <button class="btn btn-ghost btn-sm btn-rename">更名</button>
        <button class="btn btn-danger btn-sm btn-delete">刪除</button>
      </div>
    `;
    row.querySelector('.btn-rename').addEventListener('click', () => renameMember(m.id, m.name));
    row.querySelector('.btn-delete').addEventListener('click', () => deleteMember(m.id, m.name));
    container.appendChild(row);
  });
}

$('add-member-btn').addEventListener('click', async () => {
  const input = $('new-member-input');
  const rawValue = input.value.trim();
  clearError('members-error');
  if (!rawValue) { setError('members-error', '請輸入姓名'); return; }

  const names = [...new Set(rawValue.split(/[,，]/).map(n => n.trim()).filter(n => n.length > 0))];
  if (names.length === 0) { setError('members-error', '請輸入姓名'); return; }

  const duplicates = names.filter(n => members.some(m => m.name === n));
  if (duplicates.length > 0) {
    setError('members-error', `成員「${duplicates.join('、')}」已存在`);
    return;
  }

  const btn = $('add-member-btn');
  btn.disabled = true;
  showLoading();
  try {
    for (const name of names) {
      await dbOps.addMember(currentTripCode, name);
    }
    input.value = '';
    await loadMembers();
    renderMembersList();
    renderPayerDropdown();
    renderSplitsTable();
  } catch (err) {
    setError('members-error', '新增失敗：' + err.message);
  } finally {
    btn.disabled = false;
    hideLoading();
  }
});

$('new-member-input').addEventListener('keydown', e => { if (e.key === 'Enter') $('add-member-btn').click(); });

async function deleteMember(id, name) {
  showLoading();
  let expenses;
  try {
    expenses = await dbOps.getExpenses(currentTripCode);
  } catch {
    expenses = [];
  } finally {
    hideLoading();
  }

  const isInExpense = expenses.some(exp =>
    exp.payer === name || (exp.splits || []).some(s => s.person === name)
  );
  if (isInExpense) {
    setError('members-error', `「${name}」有參與花費紀錄，無法刪除。請先刪除或編輯相關花費。`);
    return;
  }

  if (!await customConfirm(`確定要刪除成員「${name}」嗎？`, { okText: '刪除', danger: true })) return;
  showLoading();
  try {
    await dbOps.deleteMember(currentTripCode, id);
    await loadMembers();
    renderMembersList();
    renderPayerDropdown();
    renderSplitsTable();
  } catch (err) {
    setError('members-error', '刪除失敗：' + err.message);
  } finally {
    hideLoading();
  }
}

async function renameMember(id, oldName) {
  const newName = await customPrompt(`為「${oldName}」重新命名`, oldName);
  if (!newName || newName === oldName) return;

  if (members.some(m => m.name === newName)) {
    setError('members-error', `成員「${newName}」已存在`);
    return;
  }

  showLoading();
  try {
    await dbOps.renameMember(currentTripCode, id, newName);

    const expenses = await dbOps.getExpenses(currentTripCode);
    const toUpdate = expenses.filter(exp =>
      exp.payer === oldName || (exp.splits || []).some(s => s.person === oldName)
    );
    await Promise.all(toUpdate.map(exp => {
      const newPayer  = exp.payer === oldName ? newName : exp.payer;
      const newSplits = (exp.splits || []).map(s =>
        s.person === oldName ? { ...s, person: newName } : s
      );
      return dbOps.updateExpense(currentTripCode, exp.id, {
        description: exp.description,
        payer: newPayer,
        total: exp.total,
        splits: newSplits
      });
    }));

    await loadMembers();
    renderMembersList();
  } catch (err) {
    setError('members-error', '更名失敗：' + err.message);
  } finally {
    hideLoading();
  }
}

// ── 帳目明細 ─────────────────────────────────────────────────

function renderExpensesMembersBar() {
  const bar = $('expenses-members-bar');
  bar.innerHTML = '';
  if (members.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'members-bar-empty';
    empty.innerHTML = '<span>還沒有成員</span>';
    const btn = document.createElement('button');
    btn.className = 'btn btn-primary btn-sm';
    btn.textContent = '新增成員';
    btn.addEventListener('click', () => switchTab('members'));
    empty.appendChild(btn);
    bar.appendChild(empty);
  } else {
    members.forEach(m => {
      const chip = document.createElement('span');
      chip.className = 'member-chip';
      chip.textContent = m.name;
      bar.appendChild(chip);
    });
  }
}

async function loadExpenses() {
  $('expenses-loading').textContent = '載入中…';
  show('expenses-loading');
  hide('expenses-error');
  hide('expenses-empty');
  $('expenses-list').innerHTML = '';
  await loadMembers();
  renderExpensesMembersBar();

  try {
    const expenses = await dbOps.getExpenses(currentTripCode);
    hide('expenses-loading');

    if (expenses.length === 0) { show('expenses-empty'); return; }

    const container = $('expenses-list');
    expenses.forEach(exp => {
      const splits = exp.splits || [];
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
            <button class="btn btn-ghost btn-sm btn-edit-expense">編輯</button>
            <button class="btn btn-danger btn-sm btn-del-expense">刪除</button>
          </div>
        </div>
        <div class="expense-splits">
          ${splits.map(s => `<span class="split-tag">${escHtml(s.person)}: ${formatMoney(s.amount)}</span>`).join('')}
        </div>
      `;
      card.querySelector('.btn-edit-expense').addEventListener('click', () => openEditExpense(exp));
      card.querySelector('.btn-del-expense').addEventListener('click', () => deleteExpense(exp.id));
      container.appendChild(card);
    });
  } catch (err) {
    hide('expenses-loading');
    setError('expenses-error', '載入失敗：' + err.message);
  }
}

$('refresh-expenses-btn').addEventListener('click', loadExpenses);

$('open-add-expense-btn').addEventListener('click', async () => {
  clearError('add-expense-error');
  $('exp-description').value = '';
  $('exp-total').value = '';
  await loadMembers();
  renderPayerDropdown();
  renderSplitsTable();
  updateSplitsTotal();
  show('add-expense-modal');
});

$('add-expense-close-btn').addEventListener('click', () => {
  hide('add-expense-modal');
  endAmountEditing();
});

async function deleteExpense(id) {
  if (!await customConfirm('確定要刪除這筆花費嗎？', { okText: '刪除', danger: true })) return;
  showLoading();
  try {
    await dbOps.deleteExpense(currentTripCode, id);
    await loadExpenses();
  } catch (err) {
    setError('expenses-error', '刪除失敗：' + err.message);
  } finally {
    hideLoading();
  }
}

// ── 新增花費 ─────────────────────────────────────────────────

function renderPayerDropdown() {
  const sel = $('exp-payer');
  sel.innerHTML = '<option value="">請選擇付款人</option>';
  members.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.name;
    opt.textContent = m.name;
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

  // 全選列
  const allRow = document.createElement('div');
  allRow.className = 'split-select-all-row';
  allRow.innerHTML = `
    <input type="checkbox" id="split-check-all" checked />
    <label for="split-check-all">全選</label>
  `;
  container.appendChild(allRow);
  const checkAll = allRow.querySelector('#split-check-all');

  // 成員列（預設全選）
  members.forEach((m, i) => {
    const row = document.createElement('div');
    row.className = 'split-input-row';
    row.innerHTML = `
      <input type="checkbox" class="split-checkbox" id="split-cb-${i}" checked />
      <label class="split-label" for="split-cb-${i}">${escHtml(m.name)}</label>
      <div class="split-amount-wrap">
        <div class="split-input-wrap">
          <span class="currency-sign">$</span>
          <input type="text" inputmode="decimal" autocomplete="off" class="split-amount" data-person="${escHtml(m.name)}" placeholder="0" />
        </div>
      </div>
    `;

    const checkbox    = row.querySelector('.split-checkbox');
    const amountWrap  = row.querySelector('.split-amount-wrap');
    const amountInput = row.querySelector('.split-amount');

    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        amountWrap.classList.remove('split-invisible');
        amountInput.focus();
      } else {
        amountWrap.classList.add('split-invisible');
        amountInput.value = '';
        updateSplitsTotal();
      }
      // 同步全選狀態
      const all = container.querySelectorAll('.split-checkbox');
      const checked = container.querySelectorAll('.split-checkbox:checked');
      checkAll.indeterminate = checked.length > 0 && checked.length < all.length;
      checkAll.checked = checked.length === all.length;
    });

    amountInput.addEventListener('input', updateSplitsTotal);
    container.appendChild(row);
  });

  // 全選控制
  checkAll.addEventListener('change', () => {
    container.querySelectorAll('.split-checkbox').forEach(cb => {
      if (cb.checked === checkAll.checked) return;
      cb.checked = checkAll.checked;
      const wrap  = cb.closest('.split-input-row').querySelector('.split-amount-wrap');
      const input = cb.closest('.split-input-row').querySelector('.split-amount');
      if (checkAll.checked) {
        wrap.classList.remove('split-invisible');
      } else {
        wrap.classList.add('split-invisible');
        input.value = '';
      }
    });
    updateSplitsTotal();
  });
}

// 加總各人分攤，寫回總金額（都還沒填時保留手動輸入的總金額，供一鍵平分使用）
function renderSplitsSum(inputSelector, totalInputId) {
  let sum = 0;
  document.querySelectorAll(inputSelector).forEach(i => { sum += parseFloat(i.value) || 0; });
  if (sum > 0) $(totalInputId).value = Math.round(sum * 100) / 100;
}

// 平分成整數金額，除不盡時隨機挑人 +1
function splitEvenly(total, inputs) {
  const n = inputs.length;
  const totalInt = Math.round(total);
  const base = Math.floor(totalInt / n);
  const remainder = totalInt - base * n;
  const order = [...inputs.keys()];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const lucky = new Set(order.slice(0, remainder));
  inputs.forEach((input, i) => { input.value = base + (lucky.has(i) ? 1 : 0); });
}

function updateSplitsTotal() {
  renderSplitsSum('.split-amount', 'exp-total');
}

async function renderAddExpenseForm() {
  $('exp-total').value = '';
  updateSplitsTotal();
  await loadMembers();
  renderPayerDropdown();
  renderSplitsTable();
}

// 一鍵平分
$('split-evenly-btn').addEventListener('click', () => {
  const total = parseFloat($('exp-total').value);
  clearError('add-expense-error');
  if (!total || total <= 0) { setError('add-expense-error', '請先輸入總金額'); return; }

  const checkedInputs = [...$('splits-table').querySelectorAll('.split-checkbox:checked')]
    .map(cb => cb.closest('.split-input-row').querySelector('.split-amount'));
  if (checkedInputs.length === 0) { setError('add-expense-error', '請先勾選參與成員'); return; }

  splitEvenly(total, checkedInputs);
  updateSplitsTotal();
});

$('add-expense-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError('add-expense-error');

  const description = $('exp-description').value.trim();
  const payer = $('exp-payer').value;
  const total = parseFloat($('exp-total').value);

  if (!description) { setError('add-expense-error', '請輸入項目名稱'); return; }
  if (!payer)        { setError('add-expense-error', '請選擇付款人'); return; }
  if (!total || total <= 0) { setError('add-expense-error', '請輸入總金額'); return; }

  const splits = [];
  document.querySelectorAll('.split-amount').forEach(input => {
    const amount = parseFloat(input.value);
    if (amount > 0) splits.push({ person: input.dataset.person, amount: Math.round(amount * 100) / 100 });
  });
  if (splits.length === 0) { setError('add-expense-error', '請至少輸入一人的分攤金額'); return; }

  const splitsSum = Math.round(splits.reduce((s, x) => s + x.amount, 0) * 100) / 100;
  const totalRounded = Math.round(total * 100) / 100;
  if (Math.abs(splitsSum - totalRounded) > 0.01) {
    setError('add-expense-error', `各人合計 ${formatMoney(splitsSum)} 與總金額 ${formatMoney(totalRounded)} 不符，請確認金額`);
    return;
  }

  const btn = $('add-expense-btn');
  btn.textContent = '新增中…';
  btn.disabled = true;
  showLoading();

  try {
    await dbOps.addExpense(currentTripCode, { date: todayStr(), description, payer, total, splits });
    hide('add-expense-modal');
    endAmountEditing();
    await loadExpenses();
  } catch (err) {
    setError('add-expense-error', '新增失敗：' + err.message);
  } finally {
    btn.textContent = '新增花費';
    btn.disabled = false;
    hideLoading();
  }
});

// ── 結算 ─────────────────────────────────────────────────────

async function loadSettlement() {
  show('settle-loading');
  hide('settle-error');
  hide('settle-content');

  try {
    const [expenses, settlements] = await Promise.all([
      dbOps.getExpenses(currentTripCode),
      dbOps.getSettlements(currentTripCode)
    ]);

    // 把 splits 展開成扁平陣列（原格式與 settlement.js 相容）
    const splits = [];
    expenses.forEach(exp => {
      (exp.splits || []).forEach(s => splits.push({ expense_id: exp.id, person: s.person, amount: s.amount }));
    });

    const memberNames = members.map(m => m.name);
    const { net, transactions } = calculateSettlements(memberNames, expenses, splits, settlements);

    hide('settle-loading');
    show('settle-content');

    renderTransactions(transactions);
    renderBalances(net);
    renderSpending(memberNames, splits);
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

  if (transactions.length === 0) { show('settle-all-clear'); return; }

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
      <button class="btn btn-success btn-sm">標記已還款</button>
    `;
    row.querySelector('button').addEventListener('click', () => markAsPaid(tx));
    list.appendChild(row);
  });
}

async function markAsPaid(tx) {
  if (!await customConfirm(`確定 ${tx.from} 已還給 ${tx.to} ${formatMoney(tx.amount)} 嗎？`)) return;
  showLoading();
  try {
    await dbOps.addSettlement(currentTripCode, {
      date: todayStr(), from_person: tx.from, to_person: tx.to, amount: tx.amount
    });
    await loadSettlement();
  } catch (err) {
    setError('settle-error', '記錄失敗：' + err.message);
  } finally {
    hideLoading();
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
    row.innerHTML = `<span class="balance-name">${escHtml(name)}</span><span class="balance-amount ${cls}">${label}</span>`;
    list.appendChild(row);
  });
}

// 每人在這趟旅程實際分攤到的花費
function renderSpending(memberNames, splits) {
  const list = $('spending-list');
  list.innerHTML = '';
  const spent = Object.fromEntries(memberNames.map(n => [n, 0]));
  splits.forEach(s => { spent[s.person] = (spent[s.person] || 0) + s.amount; });
  const rows = Object.entries(spent).map(([name, amount]) =>
    `<div class="balance-row"><span class="balance-name">${escHtml(name)}</span><span class="balance-amount">${formatMoney(amount)}</span></div>`);
  const total = Object.values(spent).reduce((a, b) => a + b, 0);
  rows.push(`<div class="balance-row spending-total"><span class="balance-name">全部合計</span><span class="balance-amount">${formatMoney(total)}</span></div>`);
  list.innerHTML = rows.join('');
}

function renderSettlementHistory(settlements) {
  const section = $('settle-history-section');
  const list    = $('settlements-history');
  list.innerHTML = '';
  if (settlements.length === 0) { hide('settle-history-section'); return; }
  show('settle-history-section');
  settlements.forEach(s => {
    const row = document.createElement('div');
    row.className = 'history-row';
    row.innerHTML = `
      <span class="history-date">${escHtml(s.date)}</span>
      <span>${escHtml(s.from_person)} → ${escHtml(s.to_person)}</span>
      <span class="history-amount">${formatMoney(s.amount)}</span>
      <button class="btn btn-danger btn-sm">刪除</button>
    `;
    row.querySelector('button').addEventListener('click', () => deleteSettlement(s.id));
    list.appendChild(row);
  });
}

async function deleteSettlement(id) {
  if (!await customConfirm('確定要刪除這筆還款紀錄嗎？', { okText: '刪除', danger: true })) return;
  showLoading();
  try {
    await dbOps.deleteSettlement(currentTripCode, id);
    await loadSettlement();
  } catch (err) {
    setError('settle-error', '刪除失敗：' + err.message);
  } finally {
    hideLoading();
  }
}

$('refresh-settle-btn').addEventListener('click', loadSettlement);

// ── 編輯花費 ─────────────────────────────────────────────────

let editingExpenseId = null;

function openEditExpense(exp) {
  editingExpenseId = exp.id;
  clearError('edit-expense-error');

  $('edit-exp-description').value = exp.description;
  $('edit-exp-total').value = exp.total;

  const sel = $('edit-exp-payer');
  sel.innerHTML = '<option value="">請選擇付款人</option>';
  members.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.name;
    opt.textContent = m.name;
    if (m.name === exp.payer) opt.selected = true;
    sel.appendChild(opt);
  });

  const container = $('edit-splits-table');
  container.innerHTML = '';
  const splitMap = {};
  (exp.splits || []).forEach(s => { splitMap[s.person] = s.amount; });

  // 全選列（狀態依既有分攤決定）
  const preCheckedCount = members.filter(m => splitMap[m.name] != null).length;
  const editAllRow = document.createElement('div');
  editAllRow.className = 'split-select-all-row';
  editAllRow.innerHTML = `
    <input type="checkbox" id="edit-split-check-all" />
    <label for="edit-split-check-all">全選</label>
  `;
  container.appendChild(editAllRow);
  const editCheckAll = editAllRow.querySelector('#edit-split-check-all');
  editCheckAll.checked = preCheckedCount === members.length;
  editCheckAll.indeterminate = preCheckedCount > 0 && preCheckedCount < members.length;

  members.forEach((m, i) => {
    const preChecked = splitMap[m.name] != null;
    const row = document.createElement('div');
    row.className = 'split-input-row';
    row.innerHTML = `
      <input type="checkbox" class="edit-split-checkbox" id="edit-split-cb-${i}" ${preChecked ? 'checked' : ''} />
      <label class="split-label" for="edit-split-cb-${i}">${escHtml(m.name)}</label>
      <div class="split-amount-wrap${preChecked ? '' : ' split-invisible'}">
        <div class="split-input-wrap">
          <span class="currency-sign">$</span>
          <input type="text" inputmode="decimal" autocomplete="off" class="edit-split-amount" data-person="${escHtml(m.name)}"
                 placeholder="0" value="${preChecked ? splitMap[m.name] : ''}" />
        </div>
      </div>
    `;

    const checkbox    = row.querySelector('.edit-split-checkbox');
    const amountWrap  = row.querySelector('.split-amount-wrap');
    const amountInput = row.querySelector('.edit-split-amount');

    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        amountWrap.classList.remove('split-invisible');
        amountInput.focus();
      } else {
        amountWrap.classList.add('split-invisible');
        amountInput.value = '';
        updateEditSplitsTotal();
      }
      const all     = container.querySelectorAll('.edit-split-checkbox');
      const checked = container.querySelectorAll('.edit-split-checkbox:checked');
      editCheckAll.indeterminate = checked.length > 0 && checked.length < all.length;
      editCheckAll.checked = checked.length === all.length;
    });

    amountInput.addEventListener('input', updateEditSplitsTotal);
    container.appendChild(row);
  });

  editCheckAll.addEventListener('change', () => {
    container.querySelectorAll('.edit-split-checkbox').forEach(cb => {
      if (cb.checked === editCheckAll.checked) return;
      cb.checked = editCheckAll.checked;
      const wrap  = cb.closest('.split-input-row').querySelector('.split-amount-wrap');
      const input = cb.closest('.split-input-row').querySelector('.edit-split-amount');
      if (editCheckAll.checked) {
        wrap.classList.remove('split-invisible');
      } else {
        wrap.classList.add('split-invisible');
        input.value = '';
      }
    });
    updateEditSplitsTotal();
  });

  updateEditSplitsTotal();
  show('edit-expense-modal');
}

function updateEditSplitsTotal() {
  renderSplitsSum('.edit-split-amount', 'edit-exp-total');
}


$('edit-split-evenly-btn').addEventListener('click', () => {
  const total = parseFloat($('edit-exp-total').value);
  clearError('edit-expense-error');
  if (!total || total <= 0) { setError('edit-expense-error', '請先輸入總金額'); return; }

  const checkedInputs = [...$('edit-splits-table').querySelectorAll('.edit-split-checkbox:checked')]
    .map(cb => cb.closest('.split-input-row').querySelector('.edit-split-amount'));
  if (checkedInputs.length === 0) { setError('edit-expense-error', '請先勾選參與成員'); return; }

  splitEvenly(total, checkedInputs);
  updateEditSplitsTotal();
});

$('edit-expense-cancel-btn').addEventListener('click', () => {
  hide('edit-expense-modal');
  endAmountEditing();
  editingExpenseId = null;
});

$('edit-expense-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError('edit-expense-error');

  const description = $('edit-exp-description').value.trim();
  const payer       = $('edit-exp-payer').value;
  const total       = parseFloat($('edit-exp-total').value);

  if (!description) { setError('edit-expense-error', '請輸入項目名稱'); return; }
  if (!payer)        { setError('edit-expense-error', '請選擇付款人'); return; }
  if (!total || total <= 0) { setError('edit-expense-error', '請輸入總金額'); return; }

  const splits = [];
  document.querySelectorAll('.edit-split-amount').forEach(input => {
    const amount = parseFloat(input.value);
    if (amount > 0) splits.push({ person: input.dataset.person, amount: Math.round(amount * 100) / 100 });
  });
  if (splits.length === 0) { setError('edit-expense-error', '請至少輸入一人的分攤金額'); return; }

  const splitsSum    = Math.round(splits.reduce((s, x) => s + x.amount, 0) * 100) / 100;
  const totalRounded = Math.round(total * 100) / 100;
  if (Math.abs(splitsSum - totalRounded) > 0.01) {
    setError('edit-expense-error', `各人合計 ${formatMoney(splitsSum)} 與總金額 ${formatMoney(totalRounded)} 不符`);
    return;
  }

  const btn = $('edit-expense-submit-btn');
  btn.disabled = true;
  btn.textContent = '儲存中…';
  showLoading();

  try {
    await dbOps.updateExpense(currentTripCode, editingExpenseId, { description, payer, total, splits });
    hide('edit-expense-modal');
    endAmountEditing();
    editingExpenseId = null;
    await loadExpenses();
  } catch (err) {
    setError('edit-expense-error', '儲存失敗：' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '儲存';
    hideLoading();
  }
});

// ── 刪除旅遊 ─────────────────────────────────────────────────

async function deleteTripFromList(code, name) {
  if (!await customConfirm(`確定要刪除「${name}」嗎？\n此操作將永久刪除所有成員、花費與還款紀錄，且無法復原。`, { okText: '刪除', danger: true })) return;
  showLoading();
  try {
    await dbOps.deleteTrip(code);
    await dbOps.removeUserTrip(currentUser.uid, code);
    renderRecentTrips();
  } catch (err) {
    alert('刪除失敗：' + err.message);
  } finally {
    hideLoading();
  }
}

// ── 金額欄：點選即全選 ＋ 簡易計算機 ──────────────────────────
const AMOUNT_SELECTOR = '.split-amount, .edit-split-amount, #exp-total, #edit-exp-total';
const calcPanel  = $('calc-panel');
const calcToggle = document.createElement('button');
calcToggle.type = 'button';
calcToggle.className = 'calc-toggle';
calcToggle.setAttribute('aria-label', '計算機');
calcToggle.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8"/>
  <path d="M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 19h.01M12 19h.01M16 19h.01"/></svg>`;

let calcInput = null;   // 目前編輯中的金額欄
let calcExpr  = '';
let calcFresh = true;   // 剛選到欄位時，按數字直接取代原本的值
let selectOnMouseUp = null;

const isCalcOpen = () => !calcPanel.classList.contains('hidden');
const isOperator = ch => ch !== '' && '+-×÷'.includes(ch);

// 只允許數字與小數點（capture 階段，先於各欄位自己的 input 監聽）
document.addEventListener('input', e => {
  if (!e.target.matches?.(AMOUNT_SELECTOR)) return;
  const clean = e.target.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
  if (clean !== e.target.value) e.target.value = clean;
}, true);

document.addEventListener('focusin', e => {
  const t = e.target;
  if (t.matches?.(AMOUNT_SELECTOR)) {
    calcInput = t;
    t.closest('.split-input-wrap').before(calcToggle);
    t.select();
    selectOnMouseUp = t;
    if (isCalcOpen()) resetCalcFromInput();
  } else if (!calcPanel.contains(t) && t !== calcToggle) {
    endAmountEditing();
  }
});

// 避免放開手指時游標落點把全選取消
document.addEventListener('mouseup', e => {
  if (e.target === selectOnMouseUp) { e.preventDefault(); e.target.select(); }
  selectOnMouseUp = null;
});

// 點到金額欄、計算機以外的地方 → 結束編輯並關閉計算機
document.addEventListener('pointerdown', e => {
  if (!calcInput) return;
  const t = e.target;
  if (t.closest('#calc-panel, .calc-toggle') || t.matches(AMOUNT_SELECTOR)) return;
  endAmountEditing();
});

// 按計算機時不要讓金額欄失去焦點
[calcPanel, calcToggle].forEach(el => el.addEventListener('pointerdown', e => e.preventDefault()));

calcToggle.addEventListener('click', () => {
  if (isCalcOpen()) { closeCalc(); calcInput?.focus(); } else { openCalc(); }
});

function openCalc() {
  if (!calcInput) return;
  // 唯讀可擋住手機鍵盤，數字改由計算機輸入
  document.querySelectorAll(AMOUNT_SELECTOR).forEach(i => { i.readOnly = true; });
  calcPanel.classList.remove('hidden');
  calcToggle.classList.add('active');
  document.body.style.setProperty('--calc-h', calcPanel.offsetHeight + 'px');
  document.body.classList.add('calc-open');
  calcInput.blur();
  calcInput.focus();   // 重新聚焦會觸發 focusin → resetCalcFromInput
}

function closeCalc() {
  if (!isCalcOpen()) return;
  calcPanel.classList.add('hidden');
  calcToggle.classList.remove('active');
  document.body.classList.remove('calc-open');
  document.querySelectorAll(AMOUNT_SELECTOR).forEach(i => { i.readOnly = false; });
}

function endAmountEditing() {
  closeCalc();
  calcToggle.remove();
  calcInput = null;
}

function resetCalcFromInput() {
  calcExpr  = calcInput.value;
  calcFresh = true;
  renderCalc();
  calcInput.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

// 先乘除後加減；運算式只由按鍵組成，格式固定為「數字 運算子 數字…」
function evalCalc(expr) {
  const parts = expr.replace(/[+\-×÷]$/, '').split(/([+\-×÷])/);
  if (parts[0] === '') return null;
  const terms = [parseFloat(parts[0])];
  for (let i = 1; i < parts.length; i += 2) {
    const n = parseFloat(parts[i + 1]);
    const last = terms.length - 1;
    if (parts[i] === '×') terms[last] *= n;
    else if (parts[i] === '÷') terms[last] /= n;
    else terms.push(parts[i] === '-' ? -n : n);
  }
  const result = terms.reduce((a, b) => a + b, 0);
  return Number.isFinite(result) ? Math.round(result) : null;
}

function renderCalc() {
  $('calc-expr').textContent = calcExpr.replace(/-/g, '−') || '0';
  const result = evalCalc(calcExpr);
  const hasOp = /[+\-×÷]/.test(calcExpr);
  $('calc-result').textContent = hasOp && result !== null ? '= ' + result : '';
}

// 每按一次就把目前結果寫回金額欄，觸發加總
function writeCalcResult() {
  const result = evalCalc(calcExpr);
  if (calcExpr === '') calcInput.value = '';
  else if (result !== null) calcInput.value = Math.max(0, result);
  calcInput.dispatchEvent(new Event('input', { bubbles: true }));
}

calcPanel.querySelector('.calc-keys').addEventListener('click', e => {
  const key = e.target.closest('button')?.dataset.key;
  if (!key || !calcInput) return;
  const last = calcExpr.slice(-1);

  if (key === 'C') {
    calcExpr = '';
    calcFresh = false;
  } else if (key === 'back') {
    calcExpr = calcExpr.slice(0, -1);
    calcFresh = false;
  } else if (key === '=') {
    const result = evalCalc(calcExpr);
    if (result !== null) calcExpr = String(Math.max(0, result));
    calcFresh = true;
  } else if (isOperator(key)) {
    if (calcExpr === '') return;
    calcExpr = isOperator(last) ? calcExpr.slice(0, -1) + key : calcExpr + key;
    calcFresh = false;
  } else {
    if (calcFresh) { calcExpr = ''; calcFresh = false; }
    if (key === '.') {
      const current = calcExpr.split(/[+\-×÷]/).pop();
      if (current.includes('.')) return;
      if (current === '') calcExpr += '0';
    }
    calcExpr += key;
  }
  renderCalc();
  writeCalcResult();
});
