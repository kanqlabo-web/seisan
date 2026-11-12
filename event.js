import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import { getFirestore, doc, onSnapshot, updateDoc } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

const app = initializeApp({
  apiKey: "AIzaSyBKbP74L4MwAOhwFXFNZbd1DFFv9M68Awo",
  authDomain: "k-sha-kun.firebaseapp.com",
  projectId: "k-sha-kun",
  storageBucket: "k-sha-kun.firebasestorage.app",
  messagingSenderId: "573497625446",
  appId: "1:573497625446:web:e056913eecdb00cac7d6a7"
});
const db = getFirestore(app);
const eventId = new URLSearchParams(location.search).get("id");

if (!eventId) { alert("イベントが指定されていません"); location.href = "index.html"; }

let currentMode = "individual", currentPayments = [], currentGroupPayments = [], paymentListExpanded = false;
const PAYMENT_LIST_VISIBLE_COUNT = 6, ROUNDING_UNIT_OPTIONS = [1, 10, 50, 100, 200, 500, 1000];

const $ = id => document.getElementById(id);
const eventTitle = $("eventTitle"), editEventButton = $("editEventButton"), addPaymentButton = $("addPaymentButton"),
  copyLinkButton = $("copyLinkButton"), resultArea = $("resultArea"), paymentManagementList = $("paymentManagementList"),
  detailToggle = $("detailToggle"), detailContent = $("detailContent"), burdenBlockTitle = $("burdenBlockTitle"),
  burdenBlockDesc = $("burdenBlockDesc"), burdenDetailList = $("burdenDetailList"), debtDetailBlock = $("debtDetailBlock"),
  debtDetailList = $("debtDetailList");

const formatYen = a => `¥${Math.round(Number(a)).toLocaleString()}`;
const formatDiscount = d => (d = Number(d)) > 0 ? `${d}%引き` : d < 0 ? `${Math.abs(d)}%増し` : "通常";

// 団体の負担割合：100%が基準（頭数どおりの通常負担）。
// 既存データにdiscount（割引率）しかない場合は自動的に負担割合へ変換する。
const getGroupBurdenRate = g => (g.burdenRate !== undefined && g.burdenRate !== null && g.burdenRate !== "")
  ? Number(g.burdenRate) : 100 - Number(g.discount || 0);
const formatBurdenRate = rate => (rate = Number(rate)) === 100 ? "負担割合100%（基準）" : `負担割合${rate}%`;

// 1人あたりの金額を単位ごとに切り上げ／切り捨てへ振り分け、
// 「集金合計」が実際の支払い金額を下回らない範囲で、できるだけ近くなる組み合わせを選ぶ。
// （支払いを立て替えた人が不足を被らないよう、集金不足は許容しない）
// items: [{ people, rawShare, rate }]（rawShareはその団体が本来負担すべき厳密な金額、rateは負担割合）
function roundGroupAmounts(items, amount, unit) {
  const u = Number(unit) > 0 ? Number(unit) : 1;

  const prepared = items.map(it => {
    const people = Number(it.people) || 0;
    const rawShare = Number(it.rawShare) || 0;
    const rawPerPerson = people > 0 ? rawShare / people : 0;
    // 浮動小数点の誤差でちょうどの金額が単位未満に丸まらないよう、わずかに補正する
    const floorPerPerson = Math.floor(rawPerPerson / u + 1e-9) * u;
    const ceilPerPerson = floorPerPerson + u;
    return {
      people,
      floorPerPerson,
      ceilPerPerson,
      increment: u * people, // この団体を切り上げにした場合に増える集金額
      remainder: rawShare - floorPerPerson * people, // 切り捨てた場合に不足する金額（0以上、increment未満）
      // 負担割合が同じ団体は1人あたりの金額も本来同じになるはずなので、同じキーでまとめて扱う
      rateKey: Math.round((Number(it.rate) || 0) * 1e6) / 1e6
    };
  });

  // 負担割合が同じ団体は「納得感」のため、切り上げ・切り捨てが割れて1人あたりの金額に差が出ないよう、
  // 常にまとめて同じ判定にする（人数が異なっていても、切り上げ時に増える金額と端数の合計を団体単位でなくグループ単位で扱う）
  const clusterIndexesByRate = new Map();
  prepared.forEach((it, i) => {
    if (!clusterIndexesByRate.has(it.rateKey)) clusterIndexesByRate.set(it.rateKey, []);
    clusterIndexesByRate.get(it.rateKey).push(i);
  });
  const clusters = Array.from(clusterIndexesByRate.values()).map(indexes => ({
    indexes,
    increment: indexes.reduce((sum, i) => sum + prepared[i].increment, 0),
    remainder: indexes.reduce((sum, i) => sum + prepared[i].remainder, 0)
  }));

  const baseTotal = prepared.reduce((sum, it) => sum + it.floorPerPerson * it.people, 0);
  const target = Number(amount) - baseTotal; // 不足なく集金するために切り上げで埋める必要がある金額
  const roundUpClusterIndexes = pickMinimalSufficientSubset(clusters, target);

  const roundUpIndexes = new Set();
  roundUpClusterIndexes.forEach(ci => { clusters[ci].indexes.forEach(i => roundUpIndexes.add(i)); });

  return prepared.map((it, i) => {
    const perPerson = roundUpIndexes.has(i) ? it.ceilPerPerson : it.floorPerPerson;
    return { perPerson, total: perPerson * it.people };
  });
}

// prepared（各要素にincrement・remainderを持つ配列）の中から、
// increment の合計が target 以上になる組み合わせのうち、最も余剰が少ない（targetに近い）ものを選ぶ。
// target未満の組み合わせは集金不足になるため候補から除外する。
// なお、同じ合計金額を達成できる組み合わせが複数ある場合は、端数（remainder）の合計が最大になる方を選ぶ。
// 端数がほぼ0の団体（切り上げる理由がほとんどない団体）を、端数が大きい団体（本来切り上げに近い団体）より
// 優先して切り上げてしまうと、特定の団体だけ不当に多く支払うことになるため。
// 団体数が少ない場合は総当たりで最適解を、多い場合は貪欲法で近似解を求める。
function pickMinimalSufficientSubset(prepared, target) {
  const n = prepared.length;
  if (n === 0) return new Set();

  if (n <= 16) {
    // 達成可能な合計値ごとに、その合計を達成する組み合わせの中で端数合計が最大のものを保持する
    let sums = new Map([[0, { mask: 0, remainderSum: 0 }]]); // 達成可能な合計値 -> {選んだ団体のビットマスク, 端数合計}
    prepared.forEach((it, i) => {
      const additions = [];
      sums.forEach((entry, sum) => {
        const newSum = sum + it.increment;
        const newRemainderSum = entry.remainderSum + it.remainder;
        const existing = sums.get(newSum);
        if (!existing || newRemainderSum > existing.remainderSum) {
          additions.push([newSum, { mask: entry.mask | (1 << i), remainderSum: newRemainderSum }]);
        }
      });
      additions.forEach(([sum, entry]) => sums.set(sum, entry));
    });

    // target以上の達成可能な合計の中で最小のものを選ぶ（全員切り上げの合計は必ずtarget以上になるため、必ず見つかる）。
    // 合計が同額の場合は、端数合計が大きい（＝より切り上げにふさわしい団体を選んでいる）方を優先する。
    let bestMask = (1 << n) - 1, bestSum = Infinity, bestRemainderSum = -Infinity;
    sums.forEach((entry, sum) => {
      if (sum < target - 1e-9) return;
      const isCloser = sum < bestSum - 1e-9;
      const isTie = Math.abs(sum - bestSum) < 1e-9 && entry.remainderSum > bestRemainderSum;
      if (isCloser || isTie) { bestSum = sum; bestMask = entry.mask; bestRemainderSum = entry.remainderSum; }
    });

    const result = new Set();
    prepared.forEach((_, i) => { if (bestMask & (1 << i)) result.add(i); });
    return result;
  }

  // 団体数が多いときの近似解：端数（remainder）が大きい＝本来切り上げに近い団体から優先的に切り上げていき、
  // 集金合計がtargetに達した時点で止めることで、切り上げの根拠が薄い団体を避けつつ余剰も抑える
  const order = prepared.map((_, i) => i).sort((a, b) => prepared[b].remainder - prepared[a].remainder);
  const result = new Set();
  let runningSum = 0;
  for (const i of order) {
    if (runningSum >= target - 1e-9) break;
    result.add(i);
    runningSum += prepared[i].increment;
  }
  return result;
}

function formatDate(val) {
  if (!val) return "";
  const d = val.toDate ? val.toDate() : new Date(val);
  return isNaN(d) ? "" : `(${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")})`;
}

function setupCollapsible(toggleButton, contentEl) {
  const toggleText = toggleButton.querySelector(".collapsible-toggle-text");
  const openText = toggleText?.textContent.trim() || "";
  const closeText = openText.replace("を見る", "を閉じる");
  toggleButton.addEventListener("click", () => {
    const isOpen = toggleButton.classList.toggle("open");
    contentEl.hidden = !isOpen;
    if (toggleText) toggleText.textContent = isOpen ? closeText : openText;
  });
}
setupCollapsible(detailToggle, detailContent);

function setBurdenBlockLabels(mode) {
  burdenBlockTitle.textContent = mode === "individual" ? "支出" : "グループごとの支払い内訳";
  burdenBlockDesc.innerHTML = mode === "individual"
    ? "参加者をタップすると、内訳（各支払いでの負担額と割引理由・割引率）が開きます。"
    : "支払いをタップすると、グループごとの配分内訳が開きます。<br>負担割合はグループごとに設定した基準（100%が通常負担）、配分割合はその支払いを実際に何%ずつ負担しているかを表します。";
}

editEventButton.addEventListener("click", e => { e.preventDefault(); location.href = `index.html?id=${eventId}`; });
addPaymentButton.addEventListener("click", () => { location.href = `${currentMode === "group" ? "grouppayment" : "payment"}.html?id=${eventId}`; });

const linkIconHTML = copyLinkButton.innerHTML;
const checkIconHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

copyLinkButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(location.href);
    copyLinkButton.innerHTML = checkIconHTML;
    setTimeout(() => copyLinkButton.innerHTML = linkIconHTML, 2000);
  } catch (e) { console.error(e); alert("リンクのコピーに失敗しました"); }
});

async function deletePayment(paymentId) {
  if (!eventId) return;
  const isIndiv = currentMode === "individual";
  const key = isIndiv ? "payments" : "groupPayments";
  const list = isIndiv ? currentPayments : currentGroupPayments;
  try {
    await updateDoc(doc(db, "events", eventId), { [key]: list.filter(p => p.id !== paymentId) });
  } catch (e) { console.error(e); alert("支払いの削除に失敗しました"); }
}

const getMemberStatuses = (m, s) => m.statuses?.map(id => s.find(st => st.id === id)).filter(Boolean) || [];
const getMemberDiscount = (m, s) => getMemberStatuses(m, s).reduce((sum, st) => sum + Number(st.discount), 0);
const getMemberStatusNames = (m, s) => getMemberStatuses(m, s).map(st => st.name).join("/");
const getAppliedStatuses = (m, s, p) => p.appliedStatusIds && m.statuses
  ? m.statuses.filter(id => p.appliedStatusIds.includes(id)).map(id => s.find(st => st.id === id)).filter(Boolean) : [];

function calculateIndividual(members, statuses, payments) {
  const data = {};
  members.forEach(m => {
    data[m.id] = { id: m.id, name: m.name, burden: 0, paid: 0, discount: getMemberDiscount(m, statuses), statusNames: getMemberStatusNames(m, statuses) };
  });
  payments.forEach(p => {
    if (data[p.payerId]) data[p.payerId].paid += Number(p.amount);
    const totalW = p.participants.reduce((sum, person) => sum + Number(person.weight), 0);
    if (!totalW) return;
    p.participants.forEach(person => {
      if (data[person.id]) data[person.id].burden += (Number(p.amount) * Number(person.weight)) / totalW;
    });
  });
  return data;
}

function calculateSettlements(data) {
  const debtors = [], creditors = [];
  Object.entries(data).forEach(([id, p]) => {
    const bal = p.paid - p.burden;
    if (bal < -1) debtors.push({ id, name: p.name, amount: -bal });
    if (bal > 1) creditors.push({ id, name: p.name, amount: bal });
  });

  const settlements = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amt = Math.min(debtors[i].amount, creditors[j].amount);
    settlements.push({ from: debtors[i].name, to: creditors[j].name, amount: amt });
    debtors[i].amount -= amt; creditors[j].amount -= amt;
    if (debtors[i].amount < 1) i++;
    if (creditors[j].amount < 1) j++;
  }
  return settlements;
}

function renderIndividualResult(members, statuses, payments) {
  if (!members.length) { resultArea.innerHTML = `<p class="empty">参加者がまだいません</p>`; return; }
  if (!payments.length) { resultArea.innerHTML = `<p class="empty">支払いを追加するとここに精算結果が表示されます</p>`; return; }

  const settlements = calculateSettlements(calculateIndividual(members, statuses, payments));
  let html = `<div class="settlement-section"><h3>精算方法</h3>`;
  if (!settlements.length) {
    html += `<div class="settlement-complete">✓ 全員精算済みです</div>`;
  } else {
    settlements.forEach(s => {
      html += `<div class="settlement-row"><div class="settlement-flow"><strong>${s.from}</strong><span class="settlement-arrow">→</span><strong>${s.to}</strong></div><b>${formatYen(s.amount)}</b></div>`;
    });
  }
  resultArea.innerHTML = html + `</div>`;
}

// 1件の支払いについて、対象グループごとの本来の取り分（rawShare）と、
// 端数処理後の実際の集金額（rounded）をまとめて計算する。
// renderGroupResult（上部の合計表示）とrenderExpenseDetailGroup（支払いごとの明細）の
// 両方がこの関数を共通で使うことで、「グループ合計」の数字が画面ごとに食い違わないようにしている。
// （以前は合計画面が「全支払いの取り分を先に合計してから1回だけ端数処理」、明細画面が
// 「支払いごとに端数処理してから合計」という別々の計算をしており、端数処理を2回に分けると
// 損失が重なりやすいため、少人数・低負担割合のグループなどで合計が一致しないことがあった）
function computeGroupPaymentShares(p, groups, unit) {
  const targets = p.targetIds?.length ? p.targetIds.map(id => groups.find(g => g.id === id)).filter(Boolean) : groups;
  const weights = targets.map(g => ({ group: g, weight: Number(g.people) * (getGroupBurdenRate(g) / 100) }));
  const totalW = weights.reduce((sum, w) => sum + w.weight, 0);
  const amount = Number(p.amount);

  const shareItems = weights.map(item => ({
    group: item.group,
    people: Number(item.group.people),
    rate: getGroupBurdenRate(item.group),
    rawShare: totalW > 0 ? (amount * item.weight) / totalW : 0
  }));
  // この支払いの集金合計が実際の金額にできるだけ近くなるよう、グループごとに切り上げ・切り捨てを振り分ける
  const rounded = roundGroupAmounts(shareItems, amount, unit);

  return { targets, shareItems, rounded, amount };
}

function renderGroupResult(groups, groupPayments, roundingUnit) {
  if (!groups.length) { resultArea.innerHTML = `<p class="empty">グループがまだありません</p>`; return; }
  if (!groupPayments.length) { resultArea.innerHTML = `<p class="empty">支払いを追加するとここに精算結果が表示されます</p>`; return; }

  const unit = ROUNDING_UNIT_OPTIONS.includes(Number(roundingUnit)) ? Number(roundingUnit) : 1;
  const paidTotal = groupPayments.reduce((sum, p) => sum + Number(p.amount), 0);

  // 支払いごとに端数処理した金額を積み上げてグループごとの合計を求める（明細の内訳と一致させるため）
  const totalsByGroupId = {};
  groups.forEach(g => { totalsByGroupId[g.id] = 0; });
  groupPayments.forEach(p => {
    const { shareItems, rounded } = computeGroupPaymentShares(p, groups, unit);
    shareItems.forEach((item, i) => { totalsByGroupId[item.group.id] += rounded[i].total; });
  });

  const resultList = groups.map(g => {
    const people = Number(g.people);
    const total = totalsByGroupId[g.id] || 0;
    return { id: g.id, name: g.name, people, burdenRate: getGroupBurdenRate(g), total, perPerson: people > 0 ? total / people : 0 };
  });

  const collectedTotal = resultList.reduce((sum, r) => sum + r.total, 0);
  const totalDiff = collectedTotal - paidTotal;
  const diffLabel = totalDiff > 0 ? `・誤差 +${formatYen(totalDiff)}` : "";

  let html = `
    <div class="group-summary"><span>支払い合計</span><strong>${formatYen(paidTotal)}</strong></div>
    <div class="group-summary-sub"><span>集金合計（端数調整後）${diffLabel}</span><strong>${formatYen(collectedTotal)}</strong></div>
    <div class="group-rounding-row"><span>1人あたりの端数処理</span>
      <select id="roundingUnitSelect">
        ${ROUNDING_UNIT_OPTIONS.map(u => `<option value="${u}" ${u === unit ? "selected" : ""}>${u}円単位</option>`).join("")}
      </select>
    </div>`;

  resultList.forEach(r => {
    html += `
      <div class="group-result-card">
        <div class="group-result-left">
          <div class="group-result-name">${r.name}</div>
          <div class="group-result-discount">${r.people}人・${formatBurdenRate(r.burdenRate)}</div>
          <div class="group-total">グループ合計 ${formatYen(r.total)}</div>
        </div>
        <div class="group-result-amount"><strong>${formatYen(r.perPerson)}</strong></div>
      </div>`;
  });
  resultArea.innerHTML = html;

  resultArea.querySelector("#roundingUnitSelect").addEventListener("change", async e => {
    try {
      await updateDoc(doc(db, "events", eventId), { roundingUnit: Number(e.target.value) });
    } catch (err) { console.error(err); alert("端数処理の設定の保存に失敗しました"); }
  });
}

function createPaymentCardList(payments, getPayerName, getParticipantsBadges, editPage) {
  const container = document.createElement("div");
  container.className = "payment-card-list";

  payments.forEach(p => {
    const dStr = formatDate(p.createdAt || p.date);
    const payerLabel = getPayerName(p);
    const subText = [payerLabel ? `${payerLabel}が立て替え` : "", dStr].filter(Boolean).join(" ");
    const badges = getParticipantsBadges(p).map((name, i) =>
      `<span class="participant-badge badge-color-${i % 5}">${name ? name.charAt(0) : "?"}</span>`
    ).join("");

    const card = document.createElement("div");
    card.className = "payment-item-card";
    card.innerHTML = `
      <div class="payment-card-main">
        <div class="payment-card-left">
          <div class="payment-card-header">
            <span class="payment-card-title">${p.description || "内容なし"}</span>
            <div class="payment-card-actions">
              <button class="icon-btn edit-btn" data-payment-id="${p.id}" title="編集">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
              </button>
              <button class="icon-btn delete-btn" data-payment-id="${p.id}" title="削除">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
            </div>
          </div>
          ${subText ? `<div class="payment-card-sub">${subText}</div>` : ""}
          <div class="payment-card-badges">${badges}</div>
        </div>
        <div class="payment-card-right"><span class="payment-card-amount">${formatYen(p.amount)}</span></div>
      </div>`;
    container.appendChild(card);
  });

  container.querySelectorAll(".edit-btn").forEach(btn => {
    btn.addEventListener("click", () => location.href = `${editPage}?id=${eventId}&paymentId=${btn.dataset.paymentId}`);
  });
  container.querySelectorAll(".delete-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (confirm("この支払いを削除してもよろしいですか？")) await deletePayment(btn.dataset.paymentId);
    });
  });
  return container;
}

function renderPaymentListWithCollapse(payments, getPayerName, getParticipantsBadges, editPage, container) {
  container.innerHTML = "";
  if (!payments.length) { container.innerHTML = `<p class="empty">支払いはまだありません</p>`; return; }

  const sorted = [...payments].reverse();
  const olderCount = Math.max(sorted.length - PAYMENT_LIST_VISIBLE_COUNT, 0);

  // 全件を1つの連続したリストとして生成する（直近6件用・過去分用でリストを分けると、
  // それぞれの末尾のカードから区切り線が消えてしまい、6件目と7件目の間の線が消える原因になるため）
  const listEl = createPaymentCardList(sorted, getPayerName, getParticipantsBadges, editPage);
  const olderCards = Array.from(listEl.children).slice(PAYMENT_LIST_VISIBLE_COUNT);
  olderCards.forEach(card => { card.hidden = !paymentListExpanded; });
  container.appendChild(listEl);

  if (!olderCount) return;

  const openText = `過去の支払い${olderCount}件を見る`, closeText = "閉じる";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `payment-list-more-button${paymentListExpanded ? " open" : ""}`;
  btn.innerHTML = `<span class="payment-list-more-text">${paymentListExpanded ? closeText : openText}</span><span class="payment-list-more-icon">▼</span>`;
  // ボタンは常にリストの末尾に置く。閉じているときは過去分の高さが0になるため、結果的に直近6件の直後に表示される
  container.appendChild(btn);

  btn.addEventListener("click", () => {
    paymentListExpanded = !paymentListExpanded;
    btn.classList.toggle("open", paymentListExpanded);
    olderCards.forEach(card => { card.hidden = !paymentListExpanded; });
    btn.querySelector(".payment-list-more-text").textContent = paymentListExpanded ? closeText : openText;
    if (!paymentListExpanded) {
      // 閉じると表示位置がボタンより下にずれてしまうため、ボタンが見える位置までスクロールする
      btn.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  });
}

function renderIndividualPayments(payments, members) {
  renderPaymentListWithCollapse(payments,
    p => p.payerName || members.find(m => m.id === p.payerId)?.name || "未設定",
    p => p.participants?.map(pt => members.find(m => m.id === pt.id)?.name || pt.name || "").filter(Boolean) || [],
    "payment.html", paymentManagementList
  );
}

function renderGroupPayments(groupPayments, groups) {
  // 団体モードの支払いに「支払った人」の概念はないため、過去のデータにpayerNameが残っていても表示しない
  renderPaymentListWithCollapse(groupPayments,
    () => "",
    p => !p.targetIds?.length ? groups.map(g => g.name) : p.targetIds.map(id => groups.find(g => g.id === id)?.name || "").filter(Boolean),
    "grouppayment.html", paymentManagementList
  );
}

function getPaymentStatusText(member, statuses, payment, participant) {
  const applied = member ? getAppliedStatuses(member, statuses, payment) : [];
  const statusDiscount = applied.reduce((sum, st) => sum + Number(st.discount), 0);
  const indivDiscount = Number(participant?.individualDiscount || 0);

  const labels = [];
  if (applied.length) labels.push(applied.map(st => st.name).join("/"));
  if (indivDiscount !== 0) labels.push("個別割引");
  return labels.length ? `${labels.join("/")}・${formatDiscount(statusDiscount + indivDiscount)}` : "通常";
}

function attachAccordionEvents(header, card, rows) {
  const toggle = () => {
    const isOpen = card.classList.toggle("open");
    rows.hidden = !isOpen;
  };
  header.addEventListener("click", toggle);
  header.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } });
}

function renderBurdenDetailIndividual(payments, members, statuses) {
  burdenDetailList.innerHTML = "";
  if (!payments.length) { burdenDetailList.innerHTML = `<p class="empty">支払いはまだありません</p>`; return; }

  let hasAnyRow = false;
  members.forEach(m => {
    const related = [];
    let totalBurden = 0;

    payments.forEach(p => {
      const pt = p.participants?.find(person => person.id === m.id);
      if (!pt) return;
      const totalW = (p.participants || []).reduce((sum, person) => sum + Number(person.weight), 0);
      const share = totalW > 0 ? (Number(p.amount) * Number(pt.weight)) / totalW : 0;
      totalBurden += share;
      related.push({ payment: p, participant: pt, share });
    });

    if (!related.length) return;
    hasAnyRow = true;

    const card = document.createElement("div");
    card.className = "member-payment-card";
    const header = document.createElement("div");
    header.className = "member-payment-header accordion-header";
    header.setAttribute("role", "button"); header.setAttribute("tabindex", "0");
    header.innerHTML = `<div><strong>${m.name}</strong><span>${related.length}件の支払い・${getMemberStatusNames(m, statuses) || "通常"}</span></div><div class="accordion-header-right"><b>${formatYen(totalBurden)}</b><span class="accordion-caret">▼</span></div>`;

    const rows = document.createElement("div");
    rows.className = "accordion-rows"; rows.hidden = true;

    related.forEach(item => {
      const p = item.payment;
      const payerName = p.payerName || members.find(mem => mem.id === p.payerId)?.name || "未設定";
      const dStr = formatDate(p.createdAt || p.date);

      const row = document.createElement("div");
      row.className = "member-payment-row";
      row.innerHTML = `<div class="member-payment-info"><strong>${p.description || "内容なし"}</strong><span>${payerName}が立て替え${dStr ? ` ${dStr}` : ""}</span><small>${getPaymentStatusText(m, statuses, p, item.participant)}</small></div><div class="member-payment-right"><b>${formatYen(item.share)}</b></div>`;
      rows.appendChild(row);
    });

    card.appendChild(header); card.appendChild(rows);
    attachAccordionEvents(header, card, rows);
    burdenDetailList.appendChild(card);
  });

  if (!hasAnyRow) burdenDetailList.innerHTML = `<p class="empty">支払いはまだありません</p>`;
}

function renderExpenseDetailGroup(groupPayments, groups, roundingUnit) {
  burdenDetailList.innerHTML = "";
  if (!groupPayments.length) { burdenDetailList.innerHTML = `<p class="empty">支払いはまだありません</p>`; return; }

  const unit = ROUNDING_UNIT_OPTIONS.includes(Number(roundingUnit)) ? Number(roundingUnit) : 1;

  groupPayments.forEach(p => {
    const { targets, shareItems, rounded, amount } = computeGroupPaymentShares(p, groups, unit);

    let detailsHTML = "";
    let collectedTotal = 0;
    shareItems.forEach((item, i) => {
      const g = item.group;
      const sharePercent = amount > 0 ? Math.round((item.rawShare / amount) * 100) : 0;
      const { perPerson, total: share } = rounded[i];
      collectedTotal += share;
      detailsHTML += `
        <div class="payment-group-detail">
          <div class="payment-group-name">
            <strong>${g.name}</strong>
            <span>${g.people}人・${formatBurdenRate(getGroupBurdenRate(g))}・配分割合 ${sharePercent}%</span>
          </div>
          <div class="payment-group-amount">
            <strong>1人 ${formatYen(perPerson)}</strong>
            <span>グループ合計 ${formatYen(share)}</span>
          </div>
        </div>`;
    });

    const dStr = formatDate(p.createdAt || p.date);
    const roundingDiff = collectedTotal - amount;
    // 団体モードの支払いに「支払った人」の概念はないため、過去のデータにpayerNameが残っていても表示しない
    const subText = [dStr, `${targets.length}グループで分担`].filter(Boolean).join("・");

    const card = document.createElement("div");
    card.className = "member-payment-card";

    const header = document.createElement("div");
    header.className = "member-payment-header accordion-header";
    header.setAttribute("role", "button");
    header.setAttribute("tabindex", "0");
    header.innerHTML = `
      <div>
        <strong>${p.description || "内容なし"}</strong>
        <span>${subText}</span>
      </div>
      <div class="accordion-header-right">
        <b>${formatYen(amount)}</b>
        <span class="accordion-caret">▼</span>
      </div>`;

    const rows = document.createElement("div");
    rows.className = "accordion-rows";
    rows.hidden = true;
    rows.innerHTML = `
      <div class="expense-accordion-body">
        <div class="payment-detail-header">グループごとの負担</div>
        <div class="payment-detail-list">${detailsHTML}</div>
        <div class="payment-collected-total">
          <span>集金合計${roundingDiff > 0 ? `（端数調整で +${formatYen(roundingDiff)}）` : ""}</span>
          <strong>${formatYen(collectedTotal)}</strong>
        </div>
      </div>`;

    card.appendChild(header);
    card.appendChild(rows);
    attachAccordionEvents(header, card, rows);
    burdenDetailList.appendChild(card);
  });
}

function calculatePaymentDebts(payments, members, statuses) {
  const relations = [];
  payments.forEach(p => {
    const payerId = p.payerId;
    if (!payerId) return;
    const payerName = p.payerName || members.find(m => m.id === payerId)?.name || "未設定";
    const totalW = (p.participants || []).reduce((sum, person) => sum + Number(person.weight), 0);
    if (!totalW) return;

    (p.participants || []).forEach(pt => {
      if (pt.id === payerId) return;
      const share = (Number(p.amount) * Number(pt.weight)) / totalW;
      if (share <= 0) return;
      const m = members.find(mem => mem.id === pt.id);

      relations.push({
        payment: p, description: p.description || "内容なし", dateText: formatDate(p.createdAt || p.date) ? ` ${formatDate(p.createdAt || p.date)}` : "",
        payerId, payerName, participantId: pt.id, participantName: m ? m.name : (pt.name || "未設定"),
        amount: share, statusText: getPaymentStatusText(m, statuses, p, pt)
      });
    });
  });
  return relations;
}

function renderDebtDetailIndividual(payments, members, statuses) {
  debtDetailList.innerHTML = "";
  if (!payments.length) { debtDetailList.innerHTML = `<p class="empty">貸し借りはまだありません</p>`; return; }

  const relations = calculatePaymentDebts(payments, members, statuses);
  if (!relations.length) { debtDetailList.innerHTML = `<p class="empty">貸し借りはありません</p>`; return; }

  let hasAnyRow = false;
  members.forEach(m => {
    const payRows = relations.filter(r => r.participantId === m.id);
    const receiveRows = relations.filter(r => r.payerId === m.id && r.participantId !== m.id);

    if (!payRows.length && !receiveRows.length) return;
    hasAnyRow = true;

    const net = receiveRows.reduce((sum, r) => sum + r.amount, 0) - payRows.reduce((sum, r) => sum + r.amount, 0);
    const receiveGroups = [], receiveMap = new Map();

    receiveRows.forEach(r => {
      let g = receiveMap.get(r.payment.id);
      if (!g) {
        g = { description: r.description, dateText: r.dateText, amount: 0, count: 0, participantName: r.participantName, statusText: r.statusText };
        receiveMap.set(r.payment.id, g); receiveGroups.push(g);
      }
      g.amount += r.amount; g.count += 1;
    });

    const card = document.createElement("div");
    card.className = "member-payment-card";
    const header = document.createElement("div");
    header.className = "member-payment-header accordion-header";
    header.setAttribute("role", "button"); header.setAttribute("tabindex", "0");
    const netLabel = net > 0 ? "受け取り" : net < 0 ? "支払い" : "差引なし";
    const netColor = net > 0 ? "debt-amount-receive" : net < 0 ? "debt-amount-pay" : "";
    header.innerHTML = `<div><strong>${m.name}</strong><span>${receiveGroups.length + payRows.length}件の貸し借り</span></div><div class="accordion-header-right"><b class="${netColor}">${netLabel} ${formatYen(Math.abs(net))}</b><span class="accordion-caret">▼</span></div>`;

    const rows = document.createElement("div");
    rows.className = "accordion-rows"; rows.hidden = true;

    receiveGroups.forEach(g => {
      const row = document.createElement("div");
      row.className = "member-payment-row";
      const sub = g.count > 1 ? `${g.count}人から受け取り${g.dateText}` : `${g.participantName}から受け取り${g.dateText}`;
      row.innerHTML = `<div class="member-payment-info"><strong>${g.description}</strong><span>${sub}</span>${g.count > 1 ? "" : `<small>${g.statusText}</small>`}</div><div class="member-payment-right"><b class="debt-amount-receive">+${formatYen(g.amount)}</b></div>`;
      rows.appendChild(row);
    });

    payRows.forEach(r => {
      const row = document.createElement("div");
      row.className = "member-payment-row";
      row.innerHTML = `<div class="member-payment-info"><strong>${r.description}</strong><span>${r.payerName}に支払い${r.dateText}</span><small>${r.statusText}</small></div><div class="member-payment-right"><b class="debt-amount-pay">-${formatYen(r.amount)}</b></div>`;
      rows.appendChild(row);
    });

    card.appendChild(header); card.appendChild(rows);
    attachAccordionEvents(header, card, rows);
    debtDetailList.appendChild(card);
  });

  if (!hasAnyRow) debtDetailList.innerHTML = `<p class="empty">貸し借りはありません</p>`;
}

function loadEvent() {
  if (!eventId) return;
  onSnapshot(doc(db, "events", eventId), snapshot => {
    if (!snapshot.exists()) { alert("イベントが見つかりません"); location.href = "index.html"; return; }

    const data = snapshot.data();
    const eventName = data.name || "名称未設定";
    currentMode = data.mode || "individual";
    currentPayments = data.payments || [];
    currentGroupPayments = data.groupPayments || [];

    eventTitle.textContent = eventName;
    document.title = `${eventName} | 清算くん`;
    setBurdenBlockLabels(currentMode);

    if (currentMode === "individual") {
      renderIndividualResult(data.members || [], data.statuses || [], currentPayments);
      renderIndividualPayments(currentPayments, data.members || []);
      renderBurdenDetailIndividual(currentPayments, data.members || [], data.statuses || []);
      renderDebtDetailIndividual(currentPayments, data.members || [], data.statuses || []);
      debtDetailBlock.hidden = false;
    } else {
      renderGroupResult(data.groups || [], currentGroupPayments, data.roundingUnit || 1);
      renderGroupPayments(currentGroupPayments, data.groups || []);
      renderExpenseDetailGroup(currentGroupPayments, data.groups || [], data.roundingUnit || 1);
      debtDetailList.innerHTML = `<p class="empty">団体モードでは貸し借りの明細はありません</p>`;
      debtDetailBlock.hidden = true;
    }
  }, err => {
    console.error(err);
    resultArea.innerHTML = `<p class="empty">データの読み込みに失敗しました</p>`;
  });
}

loadEvent();