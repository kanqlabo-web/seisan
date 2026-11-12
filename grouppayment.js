import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import { getFirestore, doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";
import { scanReceipt } from "./receiptScan_tmp.js";

const firebaseConfig = { apiKey: "AIzaSyBKbP74L4MwAOhwFXFNZbd1DFFv9M68Awo", authDomain: "k-sha-kun.firebaseapp.com", projectId: "k-sha-kun", storageBucket: "k-sha-kun.firebasestorage.app", messagingSenderId: "573497625446", appId: "1:573497625446:web:e056913eecdb00cac7d6a7" };
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const params = new URLSearchParams(window.location.search);
const eventId = params.get("id");
const paymentId = params.get("paymentId");

if (!eventId) {
  alert("イベントが指定されていません");
  location.href = "index.html";
}

const pageTitle = document.getElementById("pageTitle");
const descriptionInput = document.getElementById("description");
const amountInput = document.getElementById("amount");
const targetGroupOptions = document.getElementById("targetGroupOptions");
const addPaymentButton = document.getElementById("addPaymentButton");
const backLink = document.getElementById("backLink");
backLink.href = `event.html?id=${eventId}`;

const receiptInput = document.getElementById("receiptInput");
const scanReceiptButton = document.getElementById("scanReceiptButton");
const receiptScanStatus = document.getElementById("receiptScanStatus");

scanReceiptButton.addEventListener("click", () => receiptInput.click());
receiptInput.addEventListener("change", async () => {
  const file = receiptInput.files[0];
  if (!file) return;

  scanReceiptButton.disabled = true;
  receiptScanStatus.hidden = false;
  receiptScanStatus.textContent = "解析中...";
  try {
    const result = await scanReceipt(file);
    if (result.store) descriptionInput.value = result.store;
    if (result.total) amountInput.value = result.total;
    receiptScanStatus.textContent = "読み取りました。内容をご確認ください。";
  } catch (e) {
    console.error(e);
    alert(e.message || "レシートの解析に失敗しました");
    receiptScanStatus.hidden = true;
  } finally {
    scanReceiptButton.disabled = false;
    receiptInput.value = "";
  }
});

let groups = [], groupPayments = [], editingPayment = null;

if (paymentId) {
  pageTitle.textContent = "支払いを編集";
  document.title = "支払いを編集";
  addPaymentButton.textContent = "変更を保存";
}

function createId() { return Date.now().toString() + Math.random().toString(16).slice(2); }

// targetIdsが空／未設定の支払いは「全てのグループが対象」を意味するため、
// 編集時にその状態を復元する場合は全チェック済みで表示する
function renderTargetGroupOptions() {
  targetGroupOptions.innerHTML = "";
  if (!groups.length) { targetGroupOptions.innerHTML = `<p class="empty">グループがまだありません</p>`; return; }

  const explicitTargets = editingPayment?.targetIds?.length ? editingPayment.targetIds : null;

  groups.forEach(g => {
    const checked = explicitTargets ? explicitTargets.includes(g.id) : true;
    const label = document.createElement("label");
    label.className = "checkbox-label";
    label.innerHTML = `<input type="checkbox" value="${g.id}" ${checked ? "checked" : ""}><span>${g.name}</span>`;
    targetGroupOptions.appendChild(label);
  });
}

function getCheckedTargetIds() {
  return Array.from(targetGroupOptions.querySelectorAll("input[type=checkbox]:checked")).map(cb => cb.value);
}

async function init() {
  try {
    const snapshot = await getDoc(doc(db, "events", eventId));
    if (!snapshot.exists()) { alert("イベントが見つかりません"); location.href = "index.html"; return; }

    const data = snapshot.data();
    if (data.mode !== "group") { alert("このイベントは団体モードではありません"); location.href = `index.html?id=${eventId}`; return; }

    groups = data.groups || [];
    groupPayments = data.groupPayments || [];

    if (!groups.length) {
      alert("グループがいません。先にイベントページで参加グループを追加してください");
      location.href = `index.html?id=${eventId}`;
      return;
    }

    if (paymentId) {
      editingPayment = groupPayments.find(p => p.id === paymentId) || null;
      if (!editingPayment) { alert("支払いが見つかりません"); location.href = `event.html?id=${eventId}`; return; }
      amountInput.value = editingPayment.amount ?? "";
      descriptionInput.value = editingPayment.description || "";
    }

    renderTargetGroupOptions();
  } catch (e) {
    console.error(e);
    alert("データの読み込みに失敗しました");
  }
}
init();

addPaymentButton.addEventListener("click", async () => {
  const description = descriptionInput.value.trim();
  const amount = Number(amountInput.value);

  if (!amount || amount <= 0) return alert("正しい金額を入力してください");

  const checkedIds = getCheckedTargetIds();
  if (!checkedIds.length) return alert("対象のグループを選択してください");
  // 全てのグループがチェックされている場合は、後からグループが追加されても自動的に対象へ含まれるよう空配列（＝全員対象）として保存する
  const targetIds = checkedIds.length === groups.length ? [] : checkedIds;

  const newPayment = {
    id: paymentId || createId(),
    amount,
    description,
    targetIds,
    createdAt: editingPayment ? (editingPayment.createdAt || new Date()) : new Date()
  };

  const updatedGroupPayments = paymentId
    ? groupPayments.map(p => p.id === paymentId ? newPayment : p)
    : [...groupPayments, newPayment];

  try {
    await updateDoc(doc(db, "events", eventId), { groupPayments: updatedGroupPayments });
    location.href = `event.html?id=${eventId}`;
  } catch (error) {
    console.error(error);
    alert("支払いの保存に失敗しました");
  }
});