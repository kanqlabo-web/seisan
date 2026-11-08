import { db } from "./firebase.js";
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";
import { scanReceipt } from "./receiptScan_tmp.js";

const params = new URLSearchParams(window.location.search);
const eventId = params.get("id");
const paymentId = params.get("paymentId");

if (!eventId) {
  alert("イベントが見つかりません");
  window.location.href = "index.html";
}

const pageTitle = document.getElementById("pageTitle");
const payer = document.getElementById("payer");
const amount = document.getElementById("amount");
const description = document.getElementById("description");
const paymentStatusOptions = document.getElementById("paymentStatusOptions");
const paymentMembers = document.getElementById("paymentMembers");
const savePaymentButton = document.getElementById("savePaymentButton");
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
    if (result.store) description.value = result.store;
    if (result.total) amount.value = result.total;
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

const splitModeButton = document.getElementById("splitModeButton");
const exactModeButton = document.getElementById("exactModeButton");
const modeHint = document.getElementById("modeHint");
const amountFieldGroup = document.getElementById("amountFieldGroup");
const statusCard = document.getElementById("statusCard");
const exactModeDescription = document.getElementById("exactModeDescription");
const exactTotalDisplay = document.getElementById("exactTotalDisplay");

let currentSplitMode = "equal";
function updateModeUI() {
  const isExact = currentSplitMode === "exact";
  splitModeButton.classList.toggle("active", !isExact);
  exactModeButton.classList.toggle("active", isExact);
  amountFieldGroup.hidden = isExact;
  statusCard.hidden = isExact;
  exactModeDescription.hidden = !isExact;
  exactTotalDisplay.hidden = !isExact;
  modeHint.textContent = isExact ? "参加者ごとに金額を直接入力します（例：同じ店で別々のものを頼んだ場合）" : "参加者全員で金額を割り勘します（ステータス割引が適用されます）";
}

splitModeButton.addEventListener("click", () => {
  if (currentSplitMode === "equal") return;
  currentSplitMode = "equal";
  updateModeUI(); renderMembers();
});

exactModeButton.addEventListener("click", () => {
  if (currentSplitMode === "exact") return;
  currentSplitMode = "exact";
  updateModeUI(); renderMembers();
});

let statuses = [], members = [], payments = [], editingPayment = null;

if (paymentId) {
  pageTitle.textContent = "支払いを編集";
  document.title = "支払いを編集";
  savePaymentButton.textContent = "変更を保存";
}

function createId() { return Date.now().toString() + Math.random().toString(16).slice(2); }
const discountToRatio = d => 1 - Number(d) / 100;
function formatDiscount(d) {
  d = Number(d);
  if (d > 0) return `${d}%引き`;
  if (d < 0) return `${Math.abs(d)}%増し`;
  return "通常";
}

function renderPayerOptions() {
  payer.innerHTML = members.map(m => `<option value="${m.id}">${m.name}</option>`).join("");
  if (editingPayment) payer.value = editingPayment.payerId || "";
}

function renderStatusOptions() {
  paymentStatusOptions.innerHTML = "";
  statuses.forEach(s => {
    const checked = editingPayment
      ? (editingPayment.appliedStatusIds ? editingPayment.appliedStatusIds.includes(s.id) : true)
      : true;
    const label = document.createElement("label");
    label.className = "checkbox-label";
    label.innerHTML = `<input type="checkbox" value="${s.id}" ${checked ? "checked" : ""}><span>${s.name}（${formatDiscount(s.discount)}）</span>`;
    paymentStatusOptions.appendChild(label);
  });

  // ここでのチェック状態が変わったら、対象者一覧に表示中の適用ステータス・割引率も追従させる
  paymentStatusOptions.querySelectorAll("input[type=checkbox]").forEach(cb => {
    cb.addEventListener("change", () => {
      if (currentSplitMode === "equal") renderMembers();
    });
  });
}

// このページで現在チェックされている「この支払いで使用するステータス」のIDを取得
function getCheckedStatusIds() {
  return Array.from(paymentStatusOptions.querySelectorAll("input[type=checkbox]:checked")).map(cb => cb.value);
}

// 対象者mが持つステータスのうち、この支払いで実際に適用される（チェックされている）ものだけを返す
function getMemberAppliedStatuses(m) {
  const checkedIds = getCheckedStatusIds();
  return (m.statuses || [])
    .filter(id => checkedIds.includes(id))
    .map(id => statuses.find(s => s.id === id))
    .filter(Boolean);
}

function updateExactTotalDisplay() {
  const total = Array.from(paymentMembers.querySelectorAll(".exact-amount-input"))
    .reduce((sum, input) => sum + (Number(input.value) || 0), 0);
  exactTotalDisplay.textContent = `合計：¥${total.toLocaleString()}`;
}

function renderMembers() {
  const isExact = currentSplitMode === "exact";
  const findExistingParticipant = id => editingPayment?.participants?.find(pt => pt.id === id);

  // ステータスのチェック変更などで再描画しても、入力済みの選択・数値が消えないよう一旦保持する
  const priorState = {};
  paymentMembers.querySelectorAll(".participant-checkbox").forEach(cb => {
    priorState[cb.dataset.memberId] = { ...(priorState[cb.dataset.memberId] || {}), checked: cb.checked };
  });
  paymentMembers.querySelectorAll(".individual-discount-input").forEach(input => {
    priorState[input.dataset.memberId] = { ...(priorState[input.dataset.memberId] || {}), individualDiscount: input.value };
  });
  paymentMembers.querySelectorAll(".exact-amount-input").forEach(input => {
    priorState[input.dataset.memberId] = { ...(priorState[input.dataset.memberId] || {}), exactAmount: input.value };
  });

  paymentMembers.innerHTML = "";

  members.forEach(m => {
    const existing = findExistingParticipant(m.id);
    const prior = priorState[m.id];
    const row = document.createElement("div");
    row.className = "payment-member-row";

    if (isExact) {
      const amountValue = prior && prior.exactAmount !== undefined ? prior.exactAmount : (existing ? Math.round(existing.weight) : "");
      row.innerHTML = `
        <span>${m.name}</span>
        <input type="number" class="exact-amount-input" data-member-id="${m.id}" min="0" placeholder="金額" value="${amountValue}" style="width:120px;">`;
    } else {
      const checked = prior ? prior.checked : (existing ? true : !editingPayment);
      // この支払いで実際に使うステータス（チェック済みのもの）だけを、名前と割引率つきで表示する
      const appliedStatuses = getMemberAppliedStatuses(m);
      const appliedDiscount = appliedStatuses.reduce((sum, st) => sum + Number(st.discount), 0);
      const statusLabel = appliedStatuses.length
        ? `（${appliedStatuses.map(st => st.name).join("/")}・${formatDiscount(appliedDiscount)}）`
        : "";
      const individualDiscountValue = prior && prior.individualDiscount !== undefined ? prior.individualDiscount : (existing?.individualDiscount || 0);
      row.innerHTML = `
        <label class="checkbox-label" style="flex:1;border:none;padding:8px 0;">
          <input type="checkbox" class="participant-checkbox" data-member-id="${m.id}" ${checked ? "checked" : ""}>
          <span>${m.name}${statusLabel}</span>
        </label>
        <div class="individual-adjustment">
          <span>個別割引</span>
          <input type="number" class="individual-discount-input" data-member-id="${m.id}" value="${individualDiscountValue}">
          <span>%</span>
        </div>`;
    }
    paymentMembers.appendChild(row);
  });

  if (isExact) {
    paymentMembers.querySelectorAll(".exact-amount-input").forEach(input => {
      input.addEventListener("input", updateExactTotalDisplay);
    });
    updateExactTotalDisplay();
  }
}

async function init() {
  try {
    const snapshot = await getDoc(doc(db, "events", eventId));
    if (!snapshot.exists()) { alert("イベントが見つかりません"); location.href = "index.html"; return; }

    const data = snapshot.data();
    statuses = data.statuses || [];
    members = data.members || [];
    payments = data.payments || [];

    if (!members.length) {
      alert("参加者がいません。先にイベントページで参加者を追加してください");
      location.href = `index.html?id=${eventId}`;
      return;
    }

    if (paymentId) {
      editingPayment = payments.find(p => p.id === paymentId) || null;
      if (!editingPayment) { alert("支払いが見つかりません"); location.href = `event.html?id=${eventId}`; return; }
      amount.value = editingPayment.amount ?? "";
      description.value = editingPayment.description || "";
    }

    renderPayerOptions();
    renderStatusOptions();
    renderMembers();
  } catch (e) {
    console.error(e);
    alert("データの読み込みに失敗しました");
  }
}
init();

savePaymentButton.addEventListener("click", async () => {
  const payerId = payer.value;
  const desc = description.value.trim();
  if (!payerId) return alert("支払った人を選択してください");

  let participants = [];
  let totalAmount = 0;
  let appliedStatusIds = [];

  if (currentSplitMode === "exact") {
    paymentMembers.querySelectorAll(".exact-amount-input").forEach(input => {
      const val = Number(input.value);
      if (val > 0) {
        participants.push({ id: input.dataset.memberId, weight: val, individualDiscount: 0 });
        totalAmount += val;
      }
    });
    if (!participants.length) return alert("支払い対象者の金額を入力してください");
  } else {
    const amt = Number(amount.value);
    if (!amt || amt <= 0) return alert("正しい金額を入力してください");

    appliedStatusIds = Array.from(paymentStatusOptions.querySelectorAll("input[type=checkbox]:checked")).map(cb => cb.value);

    paymentMembers.querySelectorAll(".participant-checkbox:checked").forEach(cb => {
      const memberId = cb.dataset.memberId;
      const member = members.find(m => m.id === memberId);
      const indivInput = paymentMembers.querySelector(`.individual-discount-input[data-member-id="${memberId}"]`);
      const individualDiscount = Number(indivInput?.value || 0);
      const statusDiscount = member
        ? (member.statuses || [])
            .filter(id => appliedStatusIds.includes(id))
            .reduce((sum, id) => { const st = statuses.find(s => s.id === id); return sum + (st ? Number(st.discount) : 0); }, 0)
        : 0;
      const weight = Math.max(discountToRatio(statusDiscount + individualDiscount), 0);
      participants.push({ id: memberId, weight, individualDiscount });
    });
    if (!participants.length) return alert("支払い対象者を選択してください");
    totalAmount = amt;
  }

  const payerMember = members.find(m => m.id === payerId);
  const newPayment = {
    id: paymentId || createId(),
    payerId,
    payerName: payerMember ? payerMember.name : "未設定",
    amount: totalAmount,
    description: desc,
    participants,
    appliedStatusIds,
    createdAt: editingPayment ? (editingPayment.createdAt || new Date()) : new Date()
  };

  const updatedPayments = paymentId
    ? payments.map(p => p.id === paymentId ? newPayment : p)
    : [...payments, newPayment];

  try {
    await updateDoc(doc(db, "events", eventId), { payments: updatedPayments });
    location.href = `event.html?id=${eventId}`;
  } catch (error) {
    console.error(error);
    alert("支払いの保存に失敗しました");
  }
});