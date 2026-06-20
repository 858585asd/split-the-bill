// 負債最小化演算法

const EPSILON = 0.005;

function round2(n) {
  return Math.round(n * 100) / 100;
}

// 計算每人淨餘額
// 正值 = 別人欠他錢；負值 = 他欠別人錢
function calcNetBalances(members, expenses, splits, settlements) {
  const net = {};
  members.forEach(m => { net[m] = 0; });

  expenses.forEach(exp => {
    const payer = exp.payer;
    if (net[payer] !== undefined) net[payer] += parseFloat(exp.total) || 0;
  });

  splits.forEach(s => {
    const person = s.person;
    if (net[person] !== undefined) net[person] -= parseFloat(s.amount) || 0;
  });

  settlements.forEach(s => {
    if (net[s.from_person] !== undefined) net[s.from_person] += parseFloat(s.amount) || 0;
    if (net[s.to_person]   !== undefined) net[s.to_person]   -= parseFloat(s.amount) || 0;
  });

  Object.keys(net).forEach(k => { net[k] = round2(net[k]); });
  return net;
}

// 貪婪配對：產生最少筆數的還款清單
function minimizeDebts(net) {
  const creditors = [];
  const debtors   = [];

  Object.entries(net).forEach(([name, balance]) => {
    if (balance > EPSILON)  creditors.push({ name, amount: balance });
    if (balance < -EPSILON) debtors.push({ name, amount: -balance });
  });

  const transactions = [];

  while (creditors.length > 0 && debtors.length > 0) {
    creditors.sort((a, b) => b.amount - a.amount);
    debtors.sort((a, b) => b.amount - a.amount);

    const creditor = creditors[0];
    const debtor   = debtors[0];
    const amount   = round2(Math.min(creditor.amount, debtor.amount));

    transactions.push({ from: debtor.name, to: creditor.name, amount });

    creditor.amount = round2(creditor.amount - amount);
    debtor.amount   = round2(debtor.amount   - amount);

    if (creditor.amount < EPSILON) creditors.shift();
    if (debtor.amount   < EPSILON) debtors.shift();
  }

  return transactions;
}

function calculateSettlements(members, expenses, splits, settlements) {
  const net = calcNetBalances(members, expenses, splits, settlements);
  return {
    net,
    transactions: minimizeDebts(net)
  };
}
