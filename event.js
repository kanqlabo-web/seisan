// ========================================
// 清算くん
// イベント詳細ページ
// ========================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getFirestore,
  doc,
  onSnapshot,
  updateDoc
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

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

let currentMode = "individual";
let currentPayments = [];
let currentGroupPayments = [];

const eventTitle = document.getElementById("eventTitle");
const editEventButton = document.getElementById("editEventButton");
const addPaymentButton = document.getElementById("addPaymentButton");
const copyLinkButton = document.getElementById("copyLinkButton");
const resultArea = document.getElementById("resultArea");
const paymentManagementList = document.getElementById("paymentManagementList");

const detailToggle = document.getElementById("detailToggle");
const detailContent = document.getElementById("detailContent");

const burdenBlockTitle = document.getElementById("burdenBlockTitle");
const burdenBlockDesc = document.getElementById("burdenBlockDesc");
const burdenDetailList = document.getElementById("burdenDetailList");

const debtDetailBlock = document.getElementById("debtDetailBlock");
const debtDetailList = document.getElementById("debtDetailList");

// 支払い一覧（直近6件のみ表示、残りは折りたたみ）
const PAYMENT_LIST_VISIBLE_COUNT = 6;
let paymentListExpanded = false;

if (!eventId) {
  alert("イベントが指定されていません");
  location.href = "index.html";
}

function formatYen(amount) {
  return `¥${Math.round(Number(amount)).toLocaleString()}`;
}

function discountToRatio(discount) {
  return 1 - Number(discount) / 100;
}

// 参加グループの負担割合(%)。負担割合 = 100 − 割引率（例：割引率20% → 80%）
// 旧データ（discount保存）にも対応
function getGroupBurden(group) {
  if (group.burden !== undefined && group.burden !== null && group.burden !== "") {
    return Number(group.burden);
  }
  return 100 - Number(group.discount || 0);
}

function formatBurden(burden) {
  return `負担割合 ${Number(burden)}%`;
}

// 端数処理：1人あたりの負担額を指定した桁（unit）で切り上げる
// 例）unit=100 なら 100円未満を切り上げて100円単位にする
const ROUNDING_UNIT_OPTIONS = [1, 10, 100, 1000];

function roundUpToUnit(amount, unit) {
  const safeUnit = Number(unit) > 0 ? Number(unit) : 1;
  return Math.ceil(Number(amount) / safeUnit) * safeUnit;
}

function formatDiscount(discount) {
  discount = Number(discount);
  if (discount > 0) return `${discount}%引き`;
  if (discount < 0) return `${Math.abs(discount)}%増し`;
  return "通常";
}

function formatDate(val) {
  if (!val) return "";
  let date;
  if (val.toDate && typeof val.toDate === "function") {
    date = val.toDate();
  } else {
    date = new Date(val);
  }
  if (isNaN(date.getTime())) return "";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `(${month}/${day})`;
}

function setupCollapsible(toggleButton, contentEl) {
  const toggleText = toggleButton.querySelector(".collapsible-toggle-text");
  const openText = toggleText ? toggleText.textContent.trim() : "";
  const closeText = openText.replace("を見る", "を閉じる");

  toggleButton.addEventListener("click", () => {
    const isOpen = toggleButton.classList.toggle("open");
    contentEl.hidden = !isOpen;
    if (toggleText) {
      toggleText.textContent = isOpen ? closeText : openText;
    }
  });
}

setupCollapsible(detailToggle, detailContent);

function setBurdenBlockLabels(mode) {
  if (mode === "individual") {
    burdenBlockTitle.textContent = "支出";
    burdenBlockDesc.textContent =
      "参加者をタップすると、内訳（各支払いでの負担額と割引理由・割引率）が開きます。";
  } else {
    burdenBlockTitle.textContent = "参加グループごとの支払い内訳";
    burdenBlockDesc.textContent =
      "各支払いにおける参加グループごとの配分内訳の一覧です。";
  }
}

editEventButton.addEventListener("click", event => {
  event.preventDefault();
  location.href = `index.html?id=${eventId}`;
});

addPaymentButton.addEventListener("click", () => {
  if (currentMode === "group") {
    location.href = `group-payment.html?id=${eventId}`;
    return;
  }
  location.href = `payment.html?id=${eventId}`;
});

copyLinkButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(window.location.href);
    const originalText = copyLinkButton.textContent;
    copyLinkButton.textContent = "✓";
    setTimeout(() => {
      copyLinkButton.textContent = originalText;
    }, 2000);
  } catch (error) {
    console.error(error);
    alert("リンクのコピーに失敗しました");
  }
});

async function deletePayment(paymentId) {
  if (!eventId) return;

  const eventRef = doc(db, "events", eventId);

  try {
    if (currentMode === "individual") {
      const updatedPayments = currentPayments.filter(
        payment => payment.id !== paymentId
      );
      await updateDoc(eventRef, { payments: updatedPayments });
    } else {
      const updatedGroupPayments = currentGroupPayments.filter(
        payment => payment.id !== paymentId
      );
      await updateDoc(eventRef, { groupPayments: updatedGroupPayments });
    }
  } catch (error) {
    console.error(error);
    alert("支払いの削除に失敗しました");
  }
}

function getMemberStatuses(member, statuses) {
  if (!member.statuses || member.statuses.length === 0) return [];
  return member.statuses
    .map(statusId => statuses.find(status => status.id === statusId))
    .filter(Boolean);
}

function getMemberDiscount(member, statuses) {
  const memberStatuses = getMemberStatuses(member, statuses);
  return memberStatuses.reduce((sum, status) => sum + Number(status.discount), 0);
}

function getMemberStatusNames(member, statuses) {
  const memberStatuses = getMemberStatuses(member, statuses);
  if (memberStatuses.length === 0) return "";
  return memberStatuses.map(status => status.name).join("/");
}

function getAppliedStatuses(member, statuses, payment) {
  if (!payment.appliedStatusIds || payment.appliedStatusIds.length === 0) return [];
  if (!member.statuses || member.statuses.length === 0) return [];
  return member.statuses
    .filter(statusId => payment.appliedStatusIds.includes(statusId))
    .map(statusId => statuses.find(status => status.id === statusId))
    .filter(Boolean);
}

function calculateIndividual(members, statuses, payments) {
  const data = {};

  members.forEach(member => {
    data[member.id] = {
      id: member.id,
      name: member.name,
      burden: 0,
      paid: 0,
      discount: getMemberDiscount(member, statuses),
      statusNames: getMemberStatusNames(member, statuses)
    };
  });

  payments.forEach(payment => {
    if (data[payment.payerId]) {
      data[payment.payerId].paid += Number(payment.amount);
    }

    const totalWeight = payment.participants.reduce(
      (sum, person) => sum + Number(person.weight),
      0
    );

    if (totalWeight === 0) return;

    payment.participants.forEach(person => {
      const share = (Number(payment.amount) * Number(person.weight)) / totalWeight;
      if (data[person.id]) {
        data[person.id].burden += share;
      }
    });
  });

  return data;
}

function calculateSettlements(data) {
  const debtors = [];
  const creditors = [];

  Object.entries(data).forEach(([id, person]) => {
    const balance = person.paid - person.burden;
    if (balance < -1) debtors.push({ id, name: person.name, amount: -balance });
    if (balance > 1) creditors.push({ id, name: person.name, amount: balance });
  });

  const settlements = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].amount, creditors[j].amount);

    settlements.push({
      from: debtors[i].name,
      to: creditors[j].name,
      amount
    });

    debtors[i].amount -= amount;
    creditors[j].amount -= amount;

    if (debtors[i].amount < 1) i++;
    if (creditors[j].amount < 1) j++;
  }

  return settlements;
}

function renderIndividualResult(members, statuses, payments) {
  resultArea.innerHTML = "";

  if (members.length === 0) {
    resultArea.innerHTML = `<p class="empty">参加者がまだいません</p>`;
    return;
  }

  if (payments.length === 0) {
    resultArea.innerHTML = `<p class="empty">支払いを追加するとここに精算結果が表示されます</p>`;
    return;
  }

  const data = calculateIndividual(members, statuses, payments);
  const settlements = calculateSettlements(data);

  const settlementSection = document.createElement("div");
  settlementSection.className = "settlement-section";

  const settlementTitle = document.createElement("h3");
  settlementTitle.textContent = "精算方法";
  settlementSection.appendChild(settlementTitle);

  if (settlements.length === 0) {
    const complete = document.createElement("div");
    complete.className = "settlement-complete";
    complete.textContent = "✓ 全員精算済みです";
    settlementSection.appendChild(complete);
  } else {
    settlements.forEach(settlement => {
      const row = document.createElement("div");
      row.className = "settlement-row";
      row.innerHTML = `
        <div class="settlement-flow">
          <strong>${settlement.from}が</strong>
          <span class="settlement-arrow">→</span>
          <strong>${settlement.to}に</strong>
        </div>
        <b>${formatYen(settlement.amount)}</b>
      `;
      settlementSection.appendChild(row);
    });
  }

  resultArea.appendChild(settlementSection);
}

function calculateGroup(groups, groupPayments) {
  const results = {};

  groups.forEach(group => {
    results[group.id] = {
      id: group.id,
      name: group.name,
      people: Number(group.people),
      burden: getGroupBurden(group),
      total: 0,
      perPerson: 0
    };
  });

  groupPayments.forEach(payment => {
    const targetGroups =
      payment.targetIds && payment.targetIds.length > 0
        ? payment.targetIds.map(id => groups.find(group => group.id === id)).filter(Boolean)
        : groups;

    const weights = targetGroups.map(group => ({
      group,
      weight: Number(group.people) * (getGroupBurden(group) / 100)
    }));

    const totalWeight = weights.reduce((sum, item) => sum + item.weight, 0);

    if (totalWeight === 0) return;

    weights.forEach(item => {
      const groupShare = (Number(payment.amount) * item.weight) / totalWeight;
      if (results[item.group.id]) {
        results[item.group.id].total += groupShare;
      }
    });
  });

  Object.values(results).forEach(result => {
    result.perPerson = result.people > 0 ? result.total / result.people : 0;
  });

  return results;
}

function renderGroupResult(groups, groupPayments, roundingUnit) {
  resultArea.innerHTML = "";

  if (groups.length === 0) {
    resultArea.innerHTML = `<p class="empty">参加グループがまだありません</p>`;
    return;
  }

  if (groupPayments.length === 0) {
    resultArea.innerHTML = `<p class="empty">支払いを追加するとここに精算結果が表示されます</p>`;
    return;
  }

  const currentUnit = ROUNDING_UNIT_OPTIONS.includes(Number(roundingUnit))
    ? Number(roundingUnit)
    : 1;

  const results = calculateGroup(groups, groupPayments);
  const totalAmount = groupPayments.reduce(
    (sum, payment) => sum + Number(payment.amount),
    0
  );

  const summary = document.createElement("div");
  summary.className = "group-summary";
  summary.innerHTML = `
    <span>支払い合計</span>
    <strong>${formatYen(totalAmount)}</strong>
  `;
  resultArea.appendChild(summary);

  const roundingRow = document.createElement("div");
  roundingRow.className = "group-rounding-row";
  roundingRow.innerHTML = `
    <span>1人あたりの端数処理</span>
    <select id="roundingUnitSelect">
      ${ROUNDING_UNIT_OPTIONS.map(unit =>
        `<option value="${unit}" ${unit === currentUnit ? "selected" : ""}>${unit}円単位に切り上げ</option>`
      ).join("")}
    </select>
  `;
  resultArea.appendChild(roundingRow);

  const roundingUnitSelect = roundingRow.querySelector("#roundingUnitSelect");
  roundingUnitSelect.addEventListener("change", async () => {
    const newUnit = Number(roundingUnitSelect.value);
    try {
      await updateDoc(doc(db, "events", eventId), { roundingUnit: newUnit });
    } catch (error) {
      console.error(error);
      alert("端数処理の設定の保存に失敗しました");
    }
  });

  Object.values(results).forEach(result => {
    const roundedPerPerson = roundUpToUnit(result.perPerson, currentUnit);
    const card = document.createElement("div");
    card.className = "group-result-card";
    card.innerHTML = `
      <div class="group-result-name">${result.name}</div>
      <div class="group-result-discount">
        ${result.people}人・${formatBurden(result.burden)}
      </div>
      <div class="per-person">
        <span>1人あたりの負担額</span>
        <strong>${formatYen(roundedPerPerson)}</strong>
      </div>
      <div class="group-total">グループ合計 ${formatYen(result.total)}</div>
    `;
    resultArea.appendChild(card);
  });
}

function createPaymentCardList(payments, getPayerName, getParticipantsBadges, editPage) {
  const container = document.createElement("div");
  container.className = "payment-card-list";

  payments.forEach(payment => {
    const card = document.createElement("div");
    card.className = "payment-item-card";

    const payerName = getPayerName(payment);
    const dateStr = formatDate(payment.createdAt || payment.date);
    const dateText = dateStr ? ` ${dateStr}` : "";
    const badges = getParticipantsBadges(payment);

    const badgesHTML = badges.map((name, index) => {
      const char = name ? name.charAt(0) : "?";
      const colorIndex = index % 5;
      return `<span class="participant-badge badge-color-${colorIndex}">${char}</span>`;
    }).join("");

    card.innerHTML = `
      <div class="payment-card-main">
        <div class="payment-card-left">
          <div class="payment-card-header">
            <span class="payment-card-title">${payment.description || "内容なし"}</span>
            <div class="payment-card-actions">
              <button class="icon-btn edit-btn" data-payment-id="${payment.id}" title="編集">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 20h9"></path>
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                </svg>
              </button>
              <button class="icon-btn delete-btn" data-payment-id="${payment.id}" title="削除">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            </div>
          </div>
          <div class="payment-card-sub">
            ${payerName}が立て替え${dateText}
          </div>
          <div class="payment-card-badges">
            ${badgesHTML}
          </div>
        </div>
        <div class="payment-card-right">
          <span class="payment-card-amount">${formatYen(payment.amount)}</span>
        </div>
      </div>
    `;

    container.appendChild(card);
  });

  container.querySelectorAll(".edit-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.paymentId;
      location.href = `${editPage}?id=${eventId}&paymentId=${id}`;
    });
  });

  container.querySelectorAll(".delete-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.paymentId;
      if (confirm("この支払いを削除してもよろしいですか？")) {
        await deletePayment(id);
      }
    });
  });

  return container;
}

// ========================================
// 支払い一覧
// 新しい順に並べ、直近6件のみ表示。
// 残りは「過去の支払いを見る」で折りたたみ表示する。
// ========================================

function renderPaymentListWithCollapse(payments, getPayerName, getParticipantsBadges, editPage, container) {
  container.innerHTML = "";

  if (payments.length === 0) {
    container.innerHTML = `<p class="empty">支払いはまだありません</p>`;
    return;
  }

  // 保存順（古い順）を新しい順に並び替える
  const sortedPayments = [...payments].reverse();

  const recentPayments = sortedPayments.slice(0, PAYMENT_LIST_VISIBLE_COUNT);
  const olderPayments = sortedPayments.slice(PAYMENT_LIST_VISIBLE_COUNT);

  const recentList = createPaymentCardList(recentPayments, getPayerName, getParticipantsBadges, editPage);
  container.appendChild(recentList);

  if (olderPayments.length === 0) return;

  const openText = `過去の支払い${olderPayments.length}件を見る`;
  const closeText = "閉じる";

  const moreButton = document.createElement("button");
  moreButton.type = "button";
  moreButton.className = "payment-list-more-button";
  if (paymentListExpanded) moreButton.classList.add("open");
  moreButton.innerHTML = `
    <span class="payment-list-more-text">${paymentListExpanded ? closeText : openText}</span>
    <span class="payment-list-more-icon">▼</span>
  `;
  container.appendChild(moreButton);

  const olderContainer = document.createElement("div");
  olderContainer.hidden = !paymentListExpanded;
  const olderList = createPaymentCardList(olderPayments, getPayerName, getParticipantsBadges, editPage);
  olderContainer.appendChild(olderList);
  container.appendChild(olderContainer);

  const moreText = moreButton.querySelector(".payment-list-more-text");

  moreButton.addEventListener("click", () => {
    paymentListExpanded = !paymentListExpanded;
    moreButton.classList.toggle("open", paymentListExpanded);
    olderContainer.hidden = !paymentListExpanded;
    moreText.textContent = paymentListExpanded ? closeText : openText;
  });
}

function renderIndividualPaymentSummary(payments, members, container) {
  const getPayerName = payment =>
    payment.payerName ||
    members.find(m => m.id === payment.payerId)?.name ||
    "未設定";

  const getParticipantsBadges = payment => {
    if (!payment.participants) return [];
    return payment.participants.map(p => {
      const m = members.find(mem => mem.id === p.id);
      return m ? m.name : (p.name || "");
    }).filter(Boolean);
  };

  renderPaymentListWithCollapse(payments, getPayerName, getParticipantsBadges, "payment.html", container);
}

function renderGroupPaymentSummary(payments, groups, container) {
  const getPayerName = payment => payment.payerName || "未設定";

  const getParticipantsBadges = payment => {
    if (!payment.targetIds || payment.targetIds.length === 0) {
      return groups.map(g => g.name);
    }
    return payment.targetIds.map(id => {
      const g = groups.find(group => group.id === id);
      return g ? g.name : "";
    }).filter(Boolean);
  };

  renderPaymentListWithCollapse(payments, getPayerName, getParticipantsBadges, "group-payment.html", container);
}

function renderIndividualPayments(payments, members) {
  renderIndividualPaymentSummary(payments, members, paymentManagementList);
}

function renderGroupPayments(groupPayments, groups) {
  renderGroupPaymentSummary(groupPayments, groups, paymentManagementList);
}

// ========================================
// 支出の明細（個人モード）
// ========================================

function getPaymentStatusText(member, statuses, payment, participant) {
  const appliedStatuses = member ? getAppliedStatuses(member, statuses, payment) : [];

  let statusDiscount = 0;
  appliedStatuses.forEach(status => {
    statusDiscount += Number(status.discount);
  });

  const individualDiscount =
    participant && participant.individualDiscount
      ? Number(participant.individualDiscount)
      : 0;

  const labels = [];
  if (appliedStatuses.length > 0) {
    labels.push(appliedStatuses.map(status => status.name).join("/"));
  }
  if (individualDiscount !== 0) {
    labels.push("個別調整");
  }

  if (labels.length === 0) return "通常";

  const totalDiscount = statusDiscount + individualDiscount;
  return `${labels.join("/")}・${formatDiscount(totalDiscount)}`;
}

function makeAccordionToggle(memberCard, rowsContainer) {
  return () => {
    const isOpen = memberCard.classList.toggle("open");
    rowsContainer.hidden = !isOpen;
  };
}

function attachAccordionEvents(header, toggleAccordion) {
  header.addEventListener("click", toggleAccordion);
  header.addEventListener("keydown", event => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggleAccordion();
    }
  });
}

function renderBurdenDetailIndividual(payments, members, statuses) {
  burdenDetailList.innerHTML = "";

  if (payments.length === 0) {
    burdenDetailList.innerHTML = `<p class="empty">支払いはまだありません</p>`;
    return;
  }

  let hasAnyRow = false;

  members.forEach(member => {
    const relatedPayments = [];
    let totalBurden = 0;

    payments.forEach(payment => {
      const participant = payment.participants?.find(
        person => person.id === member.id
      );

      if (!participant) return;

      const totalWeight = (payment.participants || []).reduce(
        (sum, person) => sum + Number(person.weight),
        0
      );

      const share =
        totalWeight > 0
          ? (Number(payment.amount) * Number(participant.weight)) / totalWeight
          : 0;

      totalBurden += share;
      relatedPayments.push({ payment, participant, share });
    });

    if (relatedPayments.length === 0) return;

    hasAnyRow = true;

    const statusText = getMemberStatusNames(member, statuses) || "通常";

    const memberCard = document.createElement("div");
    memberCard.className = "member-payment-card";

    const header = document.createElement("div");
    header.className = "member-payment-header accordion-header";
    header.setAttribute("role", "button");
    header.setAttribute("tabindex", "0");
    header.innerHTML = `
      <div>
        <strong>${member.name}</strong>
        <span>${relatedPayments.length}件の支払い・${statusText}</span>
      </div>
      <div class="accordion-header-right">
        <b>${formatYen(totalBurden)}</b>
        <span class="accordion-caret">▼</span>
      </div>
    `;
    memberCard.appendChild(header);

    const rowsContainer = document.createElement("div");
    rowsContainer.className = "accordion-rows";
    rowsContainer.hidden = true;

    relatedPayments.forEach(itemData => {
      const payment = itemData.payment;
      const statusText = getPaymentStatusText(member, statuses, payment, itemData.participant);
      const payerName =
        payment.payerName ||
        members.find(m => m.id === payment.payerId)?.name ||
        "未設定";
      const dateStr = formatDate(payment.createdAt || payment.date);
      const dateText = dateStr ? ` ${dateStr}` : "";

      const row = document.createElement("div");
      row.className = "member-payment-row";
      row.innerHTML = `
        <div class="member-payment-info">
          <strong>${payment.description || "内容なし"}</strong>
          <span>${payerName}が立て替え${dateText}</span>
          <small>${statusText}</small>
        </div>
        <div class="member-payment-right">
          <b>${formatYen(itemData.share)}</b>
        </div>
      `;
      rowsContainer.appendChild(row);
    });

    memberCard.appendChild(rowsContainer);
    attachAccordionEvents(header, makeAccordionToggle(memberCard, rowsContainer));

    burdenDetailList.appendChild(memberCard);
  });

  if (!hasAnyRow) {
    burdenDetailList.innerHTML = `<p class="empty">支払いはまだありません</p>`;
  }
}

// ========================================
// 支出の明細（団体モード）
// ========================================

function renderExpenseDetailGroup(groupPayments, groups) {
  burdenDetailList.innerHTML = "";

  if (groupPayments.length === 0) {
    burdenDetailList.innerHTML = `<p class="empty">支払いはまだありません</p>`;
    return;
  }

  groupPayments.forEach(payment => {
    const item = document.createElement("div");
    item.className = "payment-history-item";

    const targetGroups =
      payment.targetIds && payment.targetIds.length > 0
        ? payment.targetIds.map(id => groups.find(group => group.id === id)).filter(Boolean)
        : groups;

    const weights = targetGroups.map(group => ({
      group,
      weight: Number(group.people) * (getGroupBurden(group) / 100)
    }));

    const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0);
    let detailsHTML = "";

    weights.forEach(itemData => {
      const group = itemData.group;
      const groupShare =
        totalWeight > 0
          ? (Number(payment.amount) * itemData.weight) / totalWeight
          : 0;

      const perPerson =
        Number(group.people) > 0 ? groupShare / Number(group.people) : 0;

      detailsHTML += `
        <div class="payment-group-detail">
          <div class="payment-group-name">
            <strong>${group.name}</strong>
            <span>${group.people}人・${formatBurden(getGroupBurden(group))}</span>
          </div>
          <div class="payment-group-amount">
            <strong>${formatYen(groupShare)}</strong>
            <span>1人あたり ${formatYen(perPerson)}</span>
          </div>
        </div>
      `;
    });

    item.innerHTML = `
      <div class="payment-history-main">
        <div>
          <strong>${payment.description || "内容なし"}</strong>
          <span class="payment-payer">建て替え：${payment.payerName || "未設定"}</span>
        </div>
        <span class="payment-amount">${formatYen(payment.amount)}</span>
      </div>
      <div class="payment-detail-header">参加グループごとの負担</div>
      <div class="payment-detail-list">${detailsHTML}</div>
    `;

    burdenDetailList.appendChild(item);
  });
}

// ========================================
// 貸し借りの明細（個人モードのみ）
// 精算方法（最小送金）とは別に、
// 実際に発生している貸し借りの関係をそのまま表示する
// ========================================

function calculatePaymentDebts(payments, members, statuses) {
  const relations = [];

  payments.forEach(payment => {
    const payerId = payment.payerId;
    if (!payerId) return;

    const payerName =
      payment.payerName ||
      members.find(m => m.id === payerId)?.name ||
      "未設定";

    const totalWeight = (payment.participants || []).reduce(
      (sum, person) => sum + Number(person.weight),
      0
    );

    if (totalWeight === 0) return;

    (payment.participants || []).forEach(participant => {
      if (participant.id === payerId) return;

      const share = (Number(payment.amount) * Number(participant.weight)) / totalWeight;
      if (share <= 0) return;

      const member = members.find(m => m.id === participant.id);
      const participantName = member ? member.name : (participant.name || "未設定");
      const statusText = getPaymentStatusText(member, statuses, payment, participant);
      const dateStr = formatDate(payment.createdAt || payment.date);

      relations.push({
        payment,
        description: payment.description || "内容なし",
        dateText: dateStr ? ` ${dateStr}` : "",
        payerId,
        payerName,
        participantId: participant.id,
        participantName,
        amount: share,
        statusText
      });
    });
  });

  return relations;
}

function renderDebtDetailIndividual(payments, members, statuses) {
  debtDetailList.innerHTML = "";

  if (payments.length === 0) {
    debtDetailList.innerHTML = `<p class="empty">貸し借りはまだありません</p>`;
    return;
  }

  const relations = calculatePaymentDebts(payments, members, statuses);

  if (relations.length === 0) {
    debtDetailList.innerHTML = `<p class="empty">貸し借りはありません</p>`;
    return;
  }

  let hasAnyRow = false;

  members.forEach(member => {
    // この人が支払うべき分（自分が参加者で、支払者ではない支払い）
    const payRows = relations.filter(r => r.participantId === member.id);

    // この人が受け取るべき分（自分が支払者で、他の参加者がいる支払い）
    const receiveRows = relations.filter(
      r => r.payerId === member.id && r.participantId !== member.id
    );

    if (payRows.length === 0 && receiveRows.length === 0) return;

    hasAnyRow = true;

    const totalPay = payRows.reduce((sum, r) => sum + r.amount, 0);
    const totalReceive = receiveRows.reduce((sum, r) => sum + r.amount, 0);
    const net = totalReceive - totalPay;

    // 同じ支払い（同じ項目）から複数人分を受け取る場合は、
    // 人物ごとに列挙せず「○人から受け取り」として合算する
    const receiveGroups = [];
    const receiveGroupMap = new Map();

    receiveRows.forEach(r => {
      const key = r.payment.id;
      let group = receiveGroupMap.get(key);
      if (!group) {
        group = {
          description: r.description,
          dateText: r.dateText,
          amount: 0,
          count: 0,
          participantName: r.participantName,
          statusText: r.statusText
        };
        receiveGroupMap.set(key, group);
        receiveGroups.push(group);
      }
      group.amount += r.amount;
      group.count += 1;
    });

    const memberCard = document.createElement("div");
    memberCard.className = "member-payment-card";

    const header = document.createElement("div");
    header.className = "member-payment-header accordion-header";
    header.setAttribute("role", "button");
    header.setAttribute("tabindex", "0");
    const netLabel = net > 0 ? "受け取り" : net < 0 ? "支払い" : "差引なし";
    const netColorClass =
      net > 0 ? "debt-amount-receive" : net < 0 ? "debt-amount-pay" : "";
    header.innerHTML = `
      <div>
        <strong>${member.name}</strong>
        <span>${receiveGroups.length + payRows.length}件の貸し借り</span>
      </div>
      <div class="accordion-header-right">
        <b class="${netColorClass}">${netLabel} ${formatYen(Math.abs(net))}</b>
        <span class="accordion-caret">▼</span>
      </div>
    `;
    memberCard.appendChild(header);

    const rowsContainer = document.createElement("div");
    rowsContainer.className = "accordion-rows";
    rowsContainer.hidden = true;

    receiveGroups.forEach(group => {
      const row = document.createElement("div");
      row.className = "member-payment-row";
      const subText =
        group.count > 1
          ? `${group.count}人から受け取り${group.dateText}`
          : `${group.participantName}から受け取り${group.dateText}`;
      const statusHTML =
        group.count > 1 ? "" : `<small>${group.statusText}</small>`;
      row.innerHTML = `
        <div class="member-payment-info">
          <strong>${group.description}</strong>
          <span>${subText}</span>
          ${statusHTML}
        </div>
        <div class="member-payment-right">
          <b class="debt-amount-receive">+${formatYen(group.amount)}</b>
        </div>
      `;
      rowsContainer.appendChild(row);
    });

    payRows.forEach(r => {
      const row = document.createElement("div");
      row.className = "member-payment-row";
      row.innerHTML = `
        <div class="member-payment-info">
          <strong>${r.description}</strong>
          <span>${r.payerName}に支払い${r.dateText}</span>
          <small>${r.statusText}</small>
        </div>
        <div class="member-payment-right">
          <b class="debt-amount-pay">-${formatYen(r.amount)}</b>
        </div>
      `;
      rowsContainer.appendChild(row);
    });

    memberCard.appendChild(rowsContainer);
    attachAccordionEvents(header, makeAccordionToggle(memberCard, rowsContainer));

    debtDetailList.appendChild(memberCard);
  });

  if (!hasAnyRow) {
    debtDetailList.innerHTML = `<p class="empty">貸し借りはありません</p>`;
  }
}

function loadEvent() {
  if (!eventId) return;

  const eventRef = doc(db, "events", eventId);

  onSnapshot(
    eventRef,
    snapshot => {
      if (!snapshot.exists()) {
        alert("イベントが見つかりません");
        location.href = "index.html";
        return;
      }

      const data = snapshot.data();
      const eventName = data.name || "名称未設定";
      const mode = data.mode || "individual";

      currentMode = mode;
      currentPayments = data.payments || [];
      currentGroupPayments = data.groupPayments || [];

      const statuses = data.statuses || [];
      const members = data.members || [];
      const groups = data.groups || [];

      eventTitle.textContent = eventName;
      document.title = `${eventName} | 清算くん`;

      setBurdenBlockLabels(mode);

      if (mode === "individual") {
        renderIndividualResult(members, statuses, currentPayments);
        renderIndividualPayments(currentPayments, members);
        renderBurdenDetailIndividual(currentPayments, members, statuses);
        renderDebtDetailIndividual(currentPayments, members, statuses);

        debtDetailBlock.hidden = false;
      } else {
        const roundingUnit = data.roundingUnit || 1;
        renderGroupResult(groups, currentGroupPayments, roundingUnit);
        renderGroupPayments(currentGroupPayments, groups);
        renderExpenseDetailGroup(currentGroupPayments, groups);

        debtDetailList.innerHTML =
          `<p class="empty">団体モードでは貸し借りの明細はありません</p>`;
        debtDetailBlock.hidden = true;
      }
    },
    error => {
      console.error(error);
      resultArea.innerHTML = `<p class="empty">データの読み込みに失敗しました</p>`;
    }
  );
}

loadEvent();