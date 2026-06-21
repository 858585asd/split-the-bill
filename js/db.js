// Firestore 資料操作層
// 資料結構：
//   users/{uid}/trips/{tripCode}  ← 使用者的旅遊清單
//   trips/{tripCode}              ← 出遊文件（tripCode = 6碼代碼）
//   trips/{tripCode}/members      ← 成員子集合
//   trips/{tripCode}/expenses     ← 花費子集合（含 splits 陣列）
//   trips/{tripCode}/settlements  ← 還款紀錄子集合

function tripsCol()                   { return db.collection('trips'); }
function membersCol(tripCode)         { return db.collection('trips').doc(tripCode).collection('members'); }
function expensesCol(tripCode)        { return db.collection('trips').doc(tripCode).collection('expenses'); }
function settlementsCol(tripCode)     { return db.collection('trips').doc(tripCode).collection('settlements'); }
function userTripsCol(uid)            { return db.collection('users').doc(uid).collection('trips'); }

// 產生 6 碼出遊代碼（排除易混淆字元）
function generateTripCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

const dbOps = {

  // ── 出遊 ──────────────────────────────────────────────

  async createTrip(name) {
    const code = generateTripCode();
    await tripsCol().doc(code).set({
      name: name.trim(),
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return code;
  },

  async getTrip(tripCode) {
    const doc = await tripsCol().doc(tripCode).get();
    if (!doc.exists) return null;
    return { code: doc.id, ...doc.data() };
  },

  // ── 成員 ──────────────────────────────────────────────

  async getMembers(tripCode) {
    const snap = await membersCol(tripCode).orderBy('createdAt').get();
    return snap.docs.map(d => ({ id: d.id, name: d.data().name }));
  },

  async addMember(tripCode, name) {
    const trimmed = name.trim();
    // 檢查重複
    const snap = await membersCol(tripCode).where('name', '==', trimmed).get();
    if (!snap.empty) throw new Error('成員已存在：' + trimmed);
    await membersCol(tripCode).add({
      name: trimmed,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  },

  async deleteMember(tripCode, memberId) {
    await membersCol(tripCode).doc(memberId).delete();
  },

  // ── 花費 ──────────────────────────────────────────────

  async getExpenses(tripCode) {
    const snap = await expensesCol(tripCode).orderBy('createdAt', 'desc').get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  async addExpense(tripCode, data) {
    await expensesCol(tripCode).add({
      date: data.date,
      description: data.description,
      payer: data.payer,
      total: data.total,
      splits: data.splits,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  },

  async deleteExpense(tripCode, expenseId) {
    await expensesCol(tripCode).doc(expenseId).delete();
  },

  // ── 還款紀錄 ───────────────────────────────────────────

  async getSettlements(tripCode) {
    const snap = await settlementsCol(tripCode).orderBy('createdAt', 'desc').get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  async addSettlement(tripCode, data) {
    await settlementsCol(tripCode).add({
      date: data.date,
      from_person: data.from_person,
      to_person: data.to_person,
      amount: data.amount,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  },

  async deleteSettlement(tripCode, settlementId) {
    await settlementsCol(tripCode).doc(settlementId).delete();
  },

  // ── 刪除整個出遊（含所有子集合） ──────────────────────────
  async deleteTrip(tripCode) {
    const deleteCol = async (colRef) => {
      const snap = await colRef.get();
      await Promise.all(snap.docs.map(d => d.ref.delete()));
    };
    await deleteCol(membersCol(tripCode));
    await deleteCol(expensesCol(tripCode));
    await deleteCol(settlementsCol(tripCode));
    await tripsCol().doc(tripCode).delete();
  },

  // ── 使用者旅遊清單（Firestore，綁定帳號） ─────────────────
  async getUserTrips(uid) {
    const snap = await userTripsCol(uid).orderBy('joinedAt', 'desc').get();
    return snap.docs.map(d => ({ code: d.id, name: d.data().name }));
  },

  async saveUserTrip(uid, code, name) {
    await userTripsCol(uid).doc(code).set({
      name,
      joinedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  },

  async removeUserTrip(uid, code) {
    await userTripsCol(uid).doc(code).delete();
  }
};
