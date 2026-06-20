// GAS API 封裝層
// 所有請求用 GET，避免 CORS preflight 問題

const TIMEOUT_MS = 15000;

async function gasGet(gasUrl, params) {
  const url = new URL(gasUrl);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url.toString(), { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || '伺服器回傳錯誤');
    return json;
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') throw new Error('連線逾時，請確認 GAS URL 是否正確');
    throw err;
  }
}

const api = {
  ping:           (url)       => gasGet(url, { action: 'ping' }),
  getMembers:     (url)       => gasGet(url, { action: 'getMembers' }),
  addMember:      (url, name) => gasGet(url, { action: 'addMember', name }),
  deleteMember:   (url, name) => gasGet(url, { action: 'deleteMember', name }),
  getExpenses:    (url)       => gasGet(url, { action: 'getExpenses' }),
  addExpense:     (url, data) => gasGet(url, { action: 'addExpense',  data: JSON.stringify(data) }),
  deleteExpense:  (url, id)   => gasGet(url, { action: 'deleteExpense', id }),
  getSplits:      (url)       => gasGet(url, { action: 'getSplits' }),
  getSettlements: (url)       => gasGet(url, { action: 'getSettlements' }),
  addSettlement:  (url, data) => gasGet(url, { action: 'addSettlement', data: JSON.stringify(data) }),
};
