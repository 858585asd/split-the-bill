// 分帳 App — Google Apps Script 後端
// 部署方式：Extensions > Apps Script > Deploy > New Deployment
// 類型：Web App，Execute as: Me，Who has access: Anyone

var SHEET_NAMES = {
  members: 'Members',
  expenses: 'Expenses',
  splits: 'Splits',
  settlements: 'Settlements'
};

function doGet(e) {
  try {
    var action = e.parameter.action;
    var result;

    switch (action) {
      case 'ping':
        result = { ok: true, message: '連線成功' };
        break;
      case 'getMembers':
        result = getMembers();
        break;
      case 'addMember':
        result = addMember(e.parameter.name);
        break;
      case 'deleteMember':
        result = deleteMember(e.parameter.name);
        break;
      case 'getExpenses':
        result = getExpenses();
        break;
      case 'addExpense':
        result = addExpense(JSON.parse(e.parameter.data));
        break;
      case 'deleteExpense':
        result = deleteExpense(e.parameter.id);
        break;
      case 'getSplits':
        result = getSplits();
        break;
      case 'getSettlements':
        result = getSettlements();
        break;
      case 'addSettlement':
        result = addSettlement(JSON.parse(e.parameter.data));
        break;
      default:
        result = { ok: false, error: '未知的 action: ' + action };
    }

    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ── 工具函式 ──────────────────────────────────────────────

function getSheet(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error('找不到工作表：' + name + '，請確認工作表名稱正確。');
  return sheet;
}

function sheetToObjects(sheet, headers) {
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  return data.slice(1).filter(function(row) {
    return row[0] !== '' && row[0] !== null && row[0] !== undefined;
  }).map(function(row) {
    var obj = {};
    headers.forEach(function(h, i) { obj[h] = row[i]; });
    return obj;
  });
}

// 從底部往上刪，避免 index 位移
function deleteRowsWhere(sheetName, colIndex, value) {
  var sheet = getSheet(sheetName);
  var data = sheet.getDataRange().getValues();
  var deleted = 0;
  for (var i = data.length - 1; i >= 1; i--) {
    if (String(data[i][colIndex]) === String(value)) {
      sheet.deleteRow(i + 1);
      deleted++;
    }
  }
  return deleted;
}

// ── 成員 ──────────────────────────────────────────────────

function getMembers() {
  var sheet = getSheet(SHEET_NAMES.members);
  var data = sheet.getDataRange().getValues();
  var members = data.slice(1)
    .map(function(row) { return row[0]; })
    .filter(function(n) { return n !== '' && n !== null; });
  return { ok: true, members: members };
}

function addMember(name) {
  if (!name || name.trim() === '') return { ok: false, error: '姓名不能為空' };
  var trimmed = name.trim();
  var existing = getMembers().members;
  if (existing.indexOf(trimmed) !== -1) return { ok: false, error: '成員已存在：' + trimmed };
  getSheet(SHEET_NAMES.members).appendRow([trimmed]);
  return { ok: true };
}

function deleteMember(name) {
  var deleted = deleteRowsWhere(SHEET_NAMES.members, 0, name);
  return { ok: true, deleted: deleted };
}

// ── 花費 ──────────────────────────────────────────────────

function getExpenses() {
  var sheet = getSheet(SHEET_NAMES.expenses);
  var expenses = sheetToObjects(sheet, ['id', 'date', 'description', 'payer', 'total']);
  return { ok: true, expenses: expenses };
}

function addExpense(data) {
  if (!data.id || !data.description || !data.payer) {
    return { ok: false, error: '缺少必要欄位' };
  }
  var expSheet = getSheet(SHEET_NAMES.expenses);
  expSheet.appendRow([data.id, data.date, data.description, data.payer, data.total]);

  var splitsSheet = getSheet(SHEET_NAMES.splits);
  data.splits.forEach(function(s) {
    splitsSheet.appendRow([data.id, s.person, s.amount]);
  });

  return { ok: true };
}

function deleteExpense(id) {
  deleteRowsWhere(SHEET_NAMES.expenses, 0, id);
  deleteRowsWhere(SHEET_NAMES.splits, 0, id);
  return { ok: true };
}

// ── 分帳明細 ───────────────────────────────────────────────

function getSplits() {
  var sheet = getSheet(SHEET_NAMES.splits);
  var splits = sheetToObjects(sheet, ['expense_id', 'person', 'amount']);
  return { ok: true, splits: splits };
}

// ── 還款紀錄 ───────────────────────────────────────────────

function getSettlements() {
  var sheet = getSheet(SHEET_NAMES.settlements);
  var settlements = sheetToObjects(sheet, ['id', 'date', 'from_person', 'to_person', 'amount']);
  return { ok: true, settlements: settlements };
}

function addSettlement(data) {
  if (!data.id || !data.from_person || !data.to_person) {
    return { ok: false, error: '缺少必要欄位' };
  }
  getSheet(SHEET_NAMES.settlements).appendRow([
    data.id, data.date, data.from_person, data.to_person, data.amount
  ]);
  return { ok: true };
}

// ── 初始化工作表（首次使用時執行）────────────────────────────

function initSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var config = [
    { name: 'Members',     headers: ['name'] },
    { name: 'Expenses',    headers: ['id', 'date', 'description', 'payer', 'total'] },
    { name: 'Splits',      headers: ['expense_id', 'person', 'amount'] },
    { name: 'Settlements', headers: ['id', 'date', 'from_person', 'to_person', 'amount'] }
  ];

  config.forEach(function(c) {
    var sheet = ss.getSheetByName(c.name);
    if (!sheet) {
      sheet = ss.insertSheet(c.name);
    }
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(c.headers);
    }
  });

  return '工作表初始化完成！';
}
