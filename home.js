import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBKbP74L4MwAOhwFXFNZbd1DFFv9M68Awo",
  authDomain: "k-sha-kun.firebaseapp.com",
  projectId: "k-sha-kun",
  storageBucket: "k-sha-kun.firebasestorage.app",
  messagingSenderId: "573497625446",
  appId: "1:573497625446:web:e056913eecdb00cac7d6a7"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const params = new URLSearchParams(window.location.search);
const eventId = params.get("id");

let currentMode = "individual", statuses = [], members = [], groups = [], payments = [], groupPayments = [];
let editingStatusId = null, editingMemberId = null, editingGroupId = null;

const eventName = document.getElementById("eventName");
const individualModeButton = document.getElementById("individualModeButton");
const groupModeButton = document.getElementById("groupModeButton");
const individualMode = document.getElementById("individualMode");
const groupMode = document.getElementById("groupMode");

const newStatusName = document.getElementById("newStatusName");
const newStatusDiscount = document.getElementById("newStatusDiscount");
const addStatusButton = document.getElementById("addStatusButton");
const statusList = document.getElementById("statusList");

const memberName = document.getElementById("memberName");
const memberStatusOptions = document.getElementById("memberStatusOptions");
const addMemberButton = document.getElementById("addMemberButton");
const memberList = document.getElementById("memberList");

const groupName = document.getElementById("groupName");
const groupPeople = document.getElementById("groupPeople");
const groupBurdenRate = document.getElementById("groupBurdenRate");
const addGroupButton = document.getElementById("addGroupButton");
const groupList = document.getElementById("groupList");

const groupFirstPaymentSection = document.getElementById("groupFirstPaymentSection");
const groupFirstPaymentEventNamePreview = document.getElementById("groupFirstPaymentEventNamePreview");
const groupFirstPaymentAmount = document.getElementById("groupFirstPaymentAmount");
const createEventButton = document.getElementById("createEventButton");
const backToEventButton = document.getElementById("backToEventButton");

function createId() { return Date.now().toString() + Math.random().toString(16).slice(2); }

// イベントIDはURLに直接載るため、共有しやすいよう英数字8文字の短いIDにする
// （62^8 ≈ 2180億通りあり、日常的な利用件数では衝突はまず起こらない）
const SHORT_ID_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"; // 62文字
const SHORT_ID_LENGTH = 8;
function createShortEventId() {
  const chars = [];
  while (chars.length < SHORT_ID_LENGTH) {
    const bytes = new Uint8Array(SHORT_ID_LENGTH * 2);
    if (window.crypto?.getRandomValues) window.crypto.getRandomValues(bytes);
    else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    for (const b of bytes) {
      if (chars.length >= SHORT_ID_LENGTH) break;
      // 256は62で割り切れないため、余りが出る範囲（248以上）のバイトは捨てて選び直し、文字の偏りをなくす
      if (b < 248) chars.push(SHORT_ID_CHARS[b % 62]);
    }
  }
  return chars.join("");
}
// ごく低い確率で既存イベントとIDが重複した場合に備え、重複しないIDになるまで生成し直す
async function generateUniqueEventId() {
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = createShortEventId();
    const snapshot = await getDoc(doc(db, "events", candidate));
    if (!snapshot.exists()) return candidate;
  }
  throw new Error("イベントIDの生成に失敗しました。もう一度お試しください");
}
function formatDiscount(discount) {
  discount = Number(discount);
  if (discount > 0) return `${discount}%引き`;
  if (discount < 0) return `${Math.abs(discount)}%増し`;
  return "通常";
}
// 団体の負担割合：100%が基準（通常の頭数どおりの負担）。
// 既存データにdiscount（割引率）しかない場合は自動的に負担割合へ変換する。
function getGroupBurdenRate(g) {
  if (g.burdenRate !== undefined && g.burdenRate !== null && g.burdenRate !== "") return Number(g.burdenRate);
  return 100 - Number(g.discount || 0);
}
function formatBurdenRate(rate) {
  rate = Number(rate);
  return rate === 100 ? "負担割合100%（基準）" : `負担割合${rate}%`;
}

function updateGroupFirstPaymentPreview() {
  if (groupFirstPaymentEventNamePreview) {
    groupFirstPaymentEventNamePreview.textContent = eventName.value.trim() || "イベント名";
  }
}
eventName.addEventListener("input", updateGroupFirstPaymentPreview);
updateGroupFirstPaymentPreview();

individualModeButton.addEventListener("click", () => {
  currentMode = "individual";
  individualMode.style.display = "block";
  groupMode.style.display = "none";
  individualModeButton.classList.add("active");
  groupModeButton.classList.remove("active");
});

groupModeButton.addEventListener("click", () => {
  currentMode = "group";
  individualMode.style.display = "none";
  groupMode.style.display = "block";
  groupModeButton.classList.add("active");
  individualModeButton.classList.remove("active");
});

addStatusButton.addEventListener("click", () => {
  const name = newStatusName.value.trim();
  const discount = Number(newStatusDiscount.value);
  if (!name) return alert("ステータス名を入力してください");
  if (newStatusDiscount.value === "" || isNaN(discount) || discount < -100 || discount > 100) return alert("割引率は-100〜100で入力してください");
  statuses.push({ id: createId(), name, discount });
  newStatusName.value = ""; newStatusDiscount.value = "";
  renderIndividual();
});

function renderStatusList() {
  statusList.innerHTML = "";
  if (!statuses.length) { statusList.innerHTML = `<p class="empty">ステータスはまだありません</p>`; return; }

  statuses.forEach(s => {
    const row = document.createElement("div");

    if (editingStatusId === s.id) {
      row.className = "list-item is-editing";
      row.innerHTML = `
        <p class="field-hint">ステータス名・割引率<span class="required-mark">*</span>（すべて必須）</p>
        <div class="edit-inputs edit-fields-row">
          <input type="text" class="edit-status-name" value="${s.name}" placeholder="ステータス名">
          <div class="discount-input-wrapper">
            <input type="number" class="edit-status-discount" value="${s.discount}" min="-100" max="100">
            <span>%</span>
          </div>
        </div>
        <div class="edit-actions">
          <button type="button" class="secondary-button status-cancel-btn">キャンセル</button>
          <button type="button" class="status-save-btn">保存</button>
        </div>`;
      statusList.appendChild(row);

      row.querySelector(".status-cancel-btn").addEventListener("click", () => {
        editingStatusId = null;
        renderStatusList();
      });
      row.querySelector(".status-save-btn").addEventListener("click", () => {
        const name = row.querySelector(".edit-status-name").value.trim();
        const discount = Number(row.querySelector(".edit-status-discount").value);
        if (!name) return alert("ステータス名を入力してください");
        if (isNaN(discount) || discount < -100 || discount > 100) return alert("割引率は-100〜100で入力してください");
        const target = statuses.find(st => st.id === s.id);
        target.name = name; target.discount = discount;
        editingStatusId = null;
        renderIndividual();
      });
    } else {
      row.className = "list-item";
      row.innerHTML = `
        <div>
          <strong>${s.name}</strong>
          <span>${formatDiscount(s.discount)}</span>
        </div>
        <div class="item-actions">
          <button type="button" class="edit-button status-edit-btn" data-id="${s.id}">編集</button>
          <button type="button" class="secondary-button status-delete-btn" data-id="${s.id}">削除</button>
        </div>`;
      statusList.appendChild(row);
    }
  });

  statusList.querySelectorAll(".status-edit-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      editingStatusId = btn.dataset.id;
      renderStatusList();
    });
  });
  statusList.querySelectorAll(".status-delete-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      if (!confirm("このステータスを削除してもよろしいですか？（参加者に設定されている場合は解除されます）")) return;
      statuses = statuses.filter(s => s.id !== id);
      members.forEach(m => { if (m.statuses) m.statuses = m.statuses.filter(sid => sid !== id); });
      if (editingStatusId === id) editingStatusId = null;
      renderIndividual();
    });
  });
}

function renderMemberStatusOptions() {
  memberStatusOptions.innerHTML = "";
  statuses.forEach(s => {
    const label = document.createElement("label");
    label.className = "checkbox-label";
    label.innerHTML = `<input type="checkbox" value="${s.id}"><span>${s.name}（${formatDiscount(s.discount)}）</span>`;
    memberStatusOptions.appendChild(label);
  });
}

function renderMemberList() {
  memberList.innerHTML = "";
  if (!members.length) { memberList.innerHTML = `<p class="empty">参加者はまだいません</p>`; return; }

  members.forEach(m => {
    const row = document.createElement("div");

    if (editingMemberId === m.id) {
      row.className = "list-item is-editing";
      const statusCheckboxes = statuses.map(s => `
        <label class="checkbox-label">
          <input type="checkbox" value="${s.id}" ${m.statuses?.includes(s.id) ? "checked" : ""}>
          <span>${s.name}（${formatDiscount(s.discount)}）</span>
        </label>`).join("");
      row.innerHTML = `
        <p class="field-hint">名前 <span class="required-mark">*</span></p>
        <div class="edit-inputs">
          <input type="text" class="edit-member-name" value="${m.name}" placeholder="名前">
          <div class="checkbox-container edit-member-statuses">${statusCheckboxes}</div>
        </div>
        <div class="edit-actions">
          <button type="button" class="secondary-button member-cancel-btn">キャンセル</button>
          <button type="button" class="member-save-btn">保存</button>
        </div>`;
      memberList.appendChild(row);

      row.querySelector(".member-cancel-btn").addEventListener("click", () => {
        editingMemberId = null;
        renderMemberList();
      });
      row.querySelector(".member-save-btn").addEventListener("click", () => {
        const name = row.querySelector(".edit-member-name").value.trim();
        if (!name) return alert("参加者名を入力してください");
        const selectedStatuses = Array.from(row.querySelectorAll(".edit-member-statuses input[type=checkbox]:checked")).map(cb => cb.value);
        const target = members.find(mem => mem.id === m.id);
        target.name = name; target.statuses = selectedStatuses;
        editingMemberId = null;
        renderMemberList();
      });
    } else {
      const statusNames = (m.statuses || []).map(id => statuses.find(s => s.id === id)?.name).filter(Boolean).join("/");
      row.className = "list-item";
      row.innerHTML = `
        <div>
          <strong>${m.name}</strong>
          ${statusNames ? `<span>${statusNames}</span>` : ""}
        </div>
        <div class="item-actions">
          <button type="button" class="edit-button member-edit-btn" data-id="${m.id}">編集</button>
          <button type="button" class="secondary-button member-delete-btn" data-id="${m.id}">削除</button>
        </div>`;
      memberList.appendChild(row);
    }
  });

  memberList.querySelectorAll(".member-edit-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      editingMemberId = btn.dataset.id;
      renderMemberList();
    });
  });
  memberList.querySelectorAll(".member-delete-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      if (!confirm("この参加者を削除してもよろしいですか？")) return;
      members = members.filter(m => m.id !== id);
      if (editingMemberId === id) editingMemberId = null;
      renderMemberList();
    });
  });
}

function renderIndividual() {
  renderStatusList();
  renderMemberStatusOptions();
  renderMemberList();
}

addMemberButton.addEventListener("click", () => {
  const name = memberName.value.trim();
  if (!name) return alert("参加者名を入力してください");

  const selectedStatuses = Array.from(memberStatusOptions.querySelectorAll("input[type=checkbox]:checked")).map(cb => cb.value);
  members.push({ id: createId(), name, statuses: selectedStatuses });
  memberName.value = "";
  memberStatusOptions.querySelectorAll("input[type=checkbox]").forEach(cb => cb.checked = false);
  renderMemberList();
});

function renderGroupList() {
  groupList.innerHTML = "";
  if (!groups.length) { groupList.innerHTML = `<p class="empty">グループはまだありません</p>`; return; }

  groups.forEach(g => {
    const row = document.createElement("div");

    if (editingGroupId === g.id) {
      row.className = "list-item is-editing";
      row.innerHTML = `
        <div class="edit-inputs edit-fields-row">
          <input type="text" class="edit-group-name" value="${g.name}" placeholder="グループ名">
          <input type="number" class="edit-group-people" value="${g.people}" placeholder="人数" min="1">
          <div class="discount-input-wrapper">
            <input type="number" class="edit-group-burden" value="${getGroupBurdenRate(g)}" min="0" max="1000">
            <span>%</span>
          </div>
        </div>
        <div class="edit-actions">
          <button type="button" class="secondary-button group-cancel-btn">キャンセル</button>
          <button type="button" class="group-save-btn">保存</button>
        </div>`;
      groupList.appendChild(row);

      row.querySelector(".group-cancel-btn").addEventListener("click", () => {
        editingGroupId = null;
        renderGroupList();
      });
      row.querySelector(".group-save-btn").addEventListener("click", () => {
        const name = row.querySelector(".edit-group-name").value.trim();
        const people = Number(row.querySelector(".edit-group-people").value);
        const burdenRateInput = row.querySelector(".edit-group-burden").value;
        const burdenRate = Number(burdenRateInput === "" ? 100 : burdenRateInput);
        if (!name) return alert("グループ名を入力してください");
        if (!people || people <= 0) return alert("正しい人数を入力してください");
        if (isNaN(burdenRate) || burdenRate < 0 || burdenRate > 1000) return alert("負担割合は0〜1000で入力してください（100%が基準です）");

        const target = groups.find(grp => grp.id === g.id);
        target.name = name; target.people = people; target.burdenRate = burdenRate;
        delete target.discount;
        editingGroupId = null;
        renderGroupList();
      });
    } else {
      row.className = "list-item";
      row.innerHTML = `
        <div>
          <strong>${g.name}</strong>
          <span>${g.people}人・${formatBurdenRate(getGroupBurdenRate(g))}</span>
        </div>
        <div class="item-actions">
          <button type="button" class="edit-button group-edit-btn" data-id="${g.id}">編集</button>
          <button type="button" class="secondary-button group-delete-btn" data-id="${g.id}">削除</button>
        </div>`;
      groupList.appendChild(row);
    }
  });

  groupList.querySelectorAll(".group-edit-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      editingGroupId = btn.dataset.id;
      renderGroupList();
    });
  });
  groupList.querySelectorAll(".group-delete-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      if (!confirm("このグループを削除してもよろしいですか？")) return;
      groups = groups.filter(g => g.id !== id);
      if (editingGroupId === id) editingGroupId = null;
      renderGroupList();
    });
  });
}

addGroupButton.addEventListener("click", () => {
  const name = groupName.value.trim();
  const people = Number(groupPeople.value);
  const burdenRate = Number(groupBurdenRate.value === "" ? 100 : groupBurdenRate.value);
  if (!name) return alert("グループ名を入力してください");
  if (!people || people <= 0) return alert("正しい人数を入力してください");
  if (isNaN(burdenRate) || burdenRate < 0 || burdenRate > 1000) return alert("負担割合は0〜1000で入力してください（100%が基準です）");

  groups.push({ id: createId(), name, people, burdenRate });
  groupName.value = ""; groupPeople.value = ""; groupBurdenRate.value = "100";
  renderGroupList();
});

backToEventButton.addEventListener("click", () => { location.href = `event.html?id=${eventId}`; });

createEventButton.addEventListener("click", async () => {
  const name = eventName.value.trim();
  if (!name) return alert("イベント名を入力してください");
  if (currentMode === "individual" && !members.length) return alert("参加者を1人以上追加してください");
  if (currentMode === "group" && !groups.length) return alert("グループを1つ以上追加してください");

  const eventData = { name, mode: currentMode, statuses, members, groups };

  try {
    if (eventId) {
      await updateDoc(doc(db, "events", eventId), eventData);
      location.href = `event.html?id=${eventId}`;
      return;
    }

    const newId = await generateUniqueEventId();
    let initialGroupPayments = [];
    if (currentMode === "group") {
      const firstAmount = Number(groupFirstPaymentAmount?.value);
      if (firstAmount > 0) {
        initialGroupPayments = [{
          id: createId(),
          amount: firstAmount,
          description: name,
          createdAt: new Date()
        }];
      }
    }

    await setDoc(doc(db, "events", newId), {
      ...eventData,
      payments: [],
      groupPayments: initialGroupPayments,
      roundingUnit: 1
    });
    location.href = `event.html?id=${newId}`;
  } catch (e) {
    console.error(e);
    alert("イベントの保存に失敗しました");
  }
});

async function loadExistingEvent() {
  try {
    const snapshot = await getDoc(doc(db, "events", eventId));
    if (!snapshot.exists()) { alert("イベントが見つかりません"); location.href = "index.html"; return; }

    const data = snapshot.data();
    eventName.value = data.name || "";
    updateGroupFirstPaymentPreview();

    statuses = data.statuses || [];
    members = data.members || [];
    groups = data.groups || [];
    payments = data.payments || [];
    groupPayments = data.groupPayments || [];

    currentMode = data.mode || "individual";
    if (currentMode === "group") groupModeButton.click();
    else individualModeButton.click();

    renderIndividual();
    renderGroupList();

    if (groupFirstPaymentSection) groupFirstPaymentSection.style.display = "none";
    createEventButton.textContent = "変更を保存";
    backToEventButton.style.display = "block";
  } catch (e) {
    console.error(e);
    alert("イベントの読み込みに失敗しました");
  }
}

if (eventId) {
  loadExistingEvent();
} else {
  renderIndividual();
  renderGroupList();
}