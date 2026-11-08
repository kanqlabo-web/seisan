// ========================================
// 清算くん
// 支払い追加・編集
// ========================================


import { db } from
  "./firebase.js";


import {

  doc,

  getDoc,

  updateDoc,

  arrayUnion

} from
  "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";


// ========================================
// URL
// ========================================

const params =
  new URLSearchParams(
    window.location.search
  );


const eventId =
  params.get("id");


const paymentId =
  params.get("paymentId");


// ========================================
// URL確認
// ========================================

if (!eventId) {

  alert(
    "イベントが見つかりません"
  );


  window.location.href =
    "index.html";

}


// ========================================
// 要素
// ========================================

const pageTitle =
  document.getElementById(
    "pageTitle"
  );


const payer =
  document.getElementById(
    "payer"
  );


const amount =
  document.getElementById(
    "amount"
  );


const description =
  document.getElementById(
    "description"
  );


const paymentStatusOptions =
  document.getElementById(
    "paymentStatusOptions"
  );


const paymentMembers =
  document.getElementById(
    "paymentMembers"
  );


const savePaymentButton =
  document.getElementById(
    "savePaymentButton"
  );


const backLink =
  document.getElementById(
    "backLink"
  );


backLink.href =
  `event.html?id=${eventId}`;


// ========================================
// 入力モード（割り勘 / 個別金額）
// ========================================

const splitModeButton =
  document.getElementById(
    "splitModeButton"
  );


const exactModeButton =
  document.getElementById(
    "exactModeButton"
  );


const modeHint =
  document.getElementById(
    "modeHint"
  );


const amountFieldGroup =
  document.getElementById(
    "amountFieldGroup"
  );


const statusCard =
  document.getElementById(
    "statusCard"
  );


const exactModeDescription =
  document.getElementById(
    "exactModeDescription"
  );


const exactTotalDisplay =
  document.getElementById(
    "exactTotalDisplay"
  );


// "equal"：割り勘モード / "exact"：個別金額モード

let currentSplitMode =
  "equal";


function updateModeUI() {

  const isExact =
    currentSplitMode === "exact";


  splitModeButton.classList.toggle(
    "active",
    !isExact
  );

  exactModeButton.classList.toggle(
    "active",
    isExact
  );


  amountFieldGroup.hidden =
    isExact;

  statusCard.hidden =
    isExact;

  exactModeDescription.hidden =
    !isExact;

  exactTotalDisplay.hidden =
    !isExact;


  modeHint.textContent =
    isExact

      ? "参加者ごとに金額を直接入力します（例：同じ店で別々のものを頼んだ場合）"

      : "参加者全員で金額を割り勘します（ステータス割引が適用されます）";

}


splitModeButton.addEventListener(
  "click",
  () => {

    if (
      currentSplitMode === "equal"
    ) {

      return;

    }


    currentSplitMode =
      "equal";


    updateModeUI();

    renderMembers();

  }
);


exactModeButton.addEventListener(
  "click",
  () => {

    if (
      currentSplitMode === "exact"
    ) {

      return;

    }


    currentSplitMode =
      "exact";


    updateModeUI();

    renderMembers();

  }
);


// ========================================
// データ
// ========================================

let statuses = [];

let members = [];

let payments = [];

let editingPayment =
  null;


// ========================================
// 編集モード表示
// ========================================

if (paymentId) {

  pageTitle.textContent =
    "支払いを編集";


  document.title =
    "支払いを編集";


  savePaymentButton.textContent =
    "変更を保存";

}


// ========================================
// 割引
// ========================================

function formatDiscount(discount) {

  discount =
    Number(discount);


  if (discount > 0) {

    return `${discount}%引き`;

  }


  if (discount < 0) {

    return `${Math.abs(discount)}%増し`;

  }


  return "通常";

}


function discountToRatio(discount) {

  return (
    1 -
    Number(discount) / 100
  );

}


// ========================================
// Firebase読み込み
// ========================================

async function loadEvent() {

  try {

    const eventRef =
      doc(
        db,
        "events",
        eventId
      );


    const snapshot =
      await getDoc(
        eventRef
      );


    if (!snapshot.exists()) {

      alert(
        "イベントが見つかりません"
      );

      return;

    }


    const eventData =
      snapshot.data();


    statuses =
      eventData.statuses || [];


    members =
      eventData.members || [];


    payments =
      eventData.payments || [];


    // ====================================
    // 編集対象取得
    // ====================================

    if (paymentId) {

      editingPayment =
        payments.find(
          payment =>
            payment.id === paymentId
        );


      if (!editingPayment) {

        alert(
          "支払い情報が見つかりません"
        );


        window.location.href =
          `event.html?id=${eventId}`;

        return;

      }

    }


    currentSplitMode =
      editingPayment &&
      editingPayment.mode === "exact"

        ? "exact"

        : "equal";


    updateModeUI();

    renderPayer();

    renderStatuses();

    renderMembers();

    fillEditingData();

  }

  catch (error) {

    console.error(error);


    alert(
      "データの読み込みに失敗しました"
    );

  }

}


// ========================================
// 支払った人
// ========================================

function renderPayer() {

  payer.innerHTML =
    `<option value="">選択してください</option>`;


  members.forEach(
    member => {

      const option =
        document.createElement(
          "option"
        );


      option.value =
        member.id;


      option.textContent =
        member.name;


      if (

        editingPayment &&

        editingPayment.payerId ===
        member.id

      ) {

        option.selected =
          true;

      }


      payer.appendChild(
        option
      );

    }
  );

}


// ========================================
// ステータス
// ========================================

function renderStatuses() {

  paymentStatusOptions.innerHTML =
    "";


  statuses.forEach(
    status => {

      const label =
        document.createElement(
          "label"
        );


      label.className =
        "checkbox-label";


      const checkbox =
        document.createElement(
          "input"
        );


      checkbox.type =
        "checkbox";


      checkbox.value =
        status.id;


      const text =
        document.createElement(
          "span"
        );


      text.textContent =
        `${status.name}（${formatDiscount(
          status.discount
        )}）`;


      label.appendChild(
        checkbox
      );


      label.appendChild(
        text
      );


      paymentStatusOptions.appendChild(
        label
      );

    }
  );

}


// ========================================
// 対象者
// ========================================

function renderMembers() {

  paymentMembers.innerHTML =
    "";


  members.forEach(
    member => {

      const row =
        document.createElement(
          "div"
        );


      row.className =
        "payment-member-row";


      // ================================
      // チェックボックス
      // ================================

      const label =
        document.createElement(
          "label"
        );


      label.className =
        "checkbox-label";


      const checkbox =
        document.createElement(
          "input"
        );


      checkbox.type =
        "checkbox";


      checkbox.value =
        member.id;


      // 新規なら全員選択

      checkbox.checked =
        !editingPayment;


      const name =
        document.createElement(
          "span"
        );


      name.textContent =
        member.name;


      label.appendChild(
        checkbox
      );


      label.appendChild(
        name
      );


      // ================================
      // 個別調整（割り勘モード）
      // または個別金額（個別金額モード）
      // ================================

      const adjustment =
        document.createElement(
          "div"
        );


      adjustment.className =
        "individual-adjustment";


      const adjustmentLabel =
        document.createElement(
          "span"
        );


      const valueInput =
        document.createElement(
          "input"
        );


      valueInput.type =
        "number";


      valueInput.value =
        0;


      const unit =
        document.createElement(
          "span"
        );


      if (
        currentSplitMode === "exact"
      ) {

        adjustmentLabel.textContent =
          "金額";


        valueInput.min =
          0;


        valueInput.placeholder =
          "0";


        valueInput.className =
          "exact-amount-input";


        unit.textContent =
          "円";


        checkbox.addEventListener(
          "change",
          updateExactTotal
        );


        valueInput.addEventListener(
          "input",
          updateExactTotal
        );

      } else {

        adjustmentLabel.textContent =
          "個別調整";


        valueInput.min =
          -100;


        valueInput.max =
          100;


        valueInput.placeholder =
          "0";


        unit.textContent =
          "%";

      }


      adjustment.appendChild(
        adjustmentLabel
      );


      adjustment.appendChild(
        valueInput
      );


      adjustment.appendChild(
        unit
      );


      row.appendChild(
        label
      );


      row.appendChild(
        adjustment
      );


      paymentMembers.appendChild(
        row
      );

    }
  );


  if (
    currentSplitMode === "exact"
  ) {

    updateExactTotal();

  }

}


// ========================================
// 個別金額モードの合計金額表示
// ========================================

function updateExactTotal() {

  let total =
    0;


  paymentMembers
    .querySelectorAll(
      ".payment-member-row"
    )
    .forEach(
      row => {

        const checkbox =
          row.querySelector(
            'input[type="checkbox"]'
          );


        const yenInput =
          row.querySelector(
            ".exact-amount-input"
          );


        if (
          checkbox &&
          checkbox.checked &&
          yenInput
        ) {

          total +=
            Number(
              yenInput.value
            ) || 0;

        }

      }
    );


  exactTotalDisplay.textContent =
    `合計金額：¥${total.toLocaleString()}`;

}


// ========================================
// 編集データ反映
// ========================================

function fillEditingData() {

  if (!editingPayment) {

    return;

  }


  // 金額

  amount.value =
    editingPayment.amount;


  // 内容

  description.value =
    editingPayment.description || "";


  // ====================================
  // 適用ステータス（割り勘モードのみ）
  // ====================================

  if (
    currentSplitMode !== "exact"
  ) {

    const appliedStatusIds =
      editingPayment.appliedStatusIds || [];


    paymentStatusOptions
      .querySelectorAll(
        'input[type="checkbox"]'
      )
      .forEach(
        checkbox => {

          checkbox.checked =
            appliedStatusIds.includes(
              checkbox.value
            );

        }
      );

  }


  // ====================================
  // 参加者
  // ====================================

  editingPayment.participants.forEach(
    participant => {

      const rows =
        paymentMembers.querySelectorAll(
          ".payment-member-row"
        );


      rows.forEach(
        row => {

          const checkbox =
            row.querySelector(
              'input[type="checkbox"]'
            );


          if (
            checkbox.value ===
            participant.id
          ) {

            checkbox.checked =
              true;


            const valueInput =
              row.querySelector(
                'input[type="number"]'
              );


            if (
              currentSplitMode === "exact"
            ) {

              const restoredAmount =
                participant.individualAmount !== undefined

                  ? participant.individualAmount

                  : participant.weight;


              if (
                restoredAmount !== undefined
              ) {

                valueInput.value =
                  restoredAmount;

              }

            } else if (

              participant.individualDiscount !==
              undefined

            ) {

              valueInput.value =
                participant.individualDiscount;

            }

          }

        }
      );

    }
  );


  // ====================================
  // 保存されていない参加者はOFF
  // ====================================

  const participantIds =
    editingPayment.participants.map(
      participant =>
        participant.id
    );


  paymentMembers
    .querySelectorAll(
      ".payment-member-row"
    )
    .forEach(
      row => {

        const checkbox =
          row.querySelector(
            'input[type="checkbox"]'
          );


        if (
          !participantIds.includes(
            checkbox.value
          )
        ) {

          checkbox.checked =
            false;

        }

      }
    );


  if (
    currentSplitMode === "exact"
  ) {

    updateExactTotal();

  }

}


// ========================================
// 支払い保存
// ========================================

savePaymentButton.addEventListener(
  "click",
  async () => {

    const payerId =
      payer.value;


    const paymentAmount =
      Number(
        amount.value
      );


    const paymentDescription =
      description.value.trim();


    // ====================================
    // バリデーション
    // ====================================

    if (!payerId) {

      alert(
        "支払った人を選択してください"
      );

      return;

    }


    // ====================================
    // 個別金額モードの保存
    // ====================================

    if (
      currentSplitMode === "exact"
    ) {

      const exactParticipants =
        [];

      let exactTotalAmount =
        0;


      paymentMembers
        .querySelectorAll(
          ".payment-member-row"
        )
        .forEach(
          row => {

            const checkbox =
              row.querySelector(
                'input[type="checkbox"]'
              );


            const yenInput =
              row.querySelector(
                ".exact-amount-input"
              );


            if (
              !checkbox.checked ||
              !yenInput
            ) {

              return;

            }


            const member =
              members.find(
                member =>
                  member.id ===
                  checkbox.value
              );


            if (!member) {

              return;

            }


            const individualAmount =
              Number(
                yenInput.value
              ) || 0;


            if (
              individualAmount <= 0
            ) {

              return;

            }


            exactTotalAmount +=
              individualAmount;


            exactParticipants.push({

              id:
                member.id,

              name:
                member.name,

              weight:
                individualAmount,

              individualAmount,

              individualDiscount:
                0,

              appliedStatusIds:
                []

            });

          }
        );


      if (
        exactParticipants.length === 0
      ) {

        alert(
          "金額を入力した対象者がいません"
        );

        return;

      }


      const payerMember =
        members.find(
          member =>
            member.id === payerId
        );


      const exactPayment = {

        id:

          editingPayment

            ? editingPayment.id

            : crypto.randomUUID(),


        payerId,


        payerName:
          payerMember.name,


        amount:
          exactTotalAmount,


        description:
          paymentDescription,


        // 個別金額モードでは
        // ステータス割引は使用しない
        mode:
          "exact",

        appliedStatusIds:
          [],


        participants:
          exactParticipants,


        createdAt:

          editingPayment

            ? editingPayment.createdAt

            : new Date().toISOString(),


        updatedAt:
          new Date().toISOString()

      };


      try {

        const eventRef =
          doc(
            db,
            "events",
            eventId
          );


        if (editingPayment) {

          const updatedPayments =
            payments.map(
              item =>

                item.id ===
                editingPayment.id

                  ? exactPayment

                  : item
            );


          await updateDoc(

            eventRef,

            {

              payments:
                updatedPayments

            }

          );

        }

        else {

          await updateDoc(

            eventRef,

            {

              payments:
                arrayUnion(
                  exactPayment
                )

            }

          );

        }


        window.location.href =
          `event.html?id=${eventId}`;

      }

      catch (error) {

        console.error(error);


        alert(
          editingPayment

            ? "支払いの更新に失敗しました"

            : "支払いの保存に失敗しました"
        );

      }


      return;

    }


    if (

      !paymentAmount ||

      paymentAmount <= 0

    ) {

      alert(
        "正しい金額を入力してください"
      );

      return;

    }


    // ====================================
    // 適用ステータス
    // ====================================

    const appliedStatusIds =
      Array.from(

        paymentStatusOptions
          .querySelectorAll(
            "input:checked"
          )

      )
      .map(
        checkbox =>
          checkbox.value
      );


    // ====================================
    // 対象者作成
    // ====================================

    const participants =
      [];


    paymentMembers
      .querySelectorAll(
        ".payment-member-row"
      )
      .forEach(
        row => {

          const checkbox =
            row.querySelector(
              'input[type="checkbox"]'
            );


          const discountInput =
            row.querySelector(
              'input[type="number"]'
            );


          if (
            !checkbox.checked
          ) {

            return;

          }


          const member =
            members.find(
              member =>
                member.id ===
                checkbox.value
            );


          if (!member) {

            return;

          }


          const individualDiscount =
            Number(
              discountInput.value
            ) || 0;


          if (

            individualDiscount < -100 ||

            individualDiscount > 100

          ) {

            alert(
              "個別調整は-100〜100で入力してください"
            );


            throw new Error(
              "Invalid individual discount"
            );

          }


          let weight =
            1;


          // ==============================
          // この人に実際に適用される
          // ステータスだけ取得
          // ==============================

          const memberAppliedStatusIds =
            (member.statuses || [])
              .filter(
                statusId =>
                  appliedStatusIds.includes(
                    statusId
                  )
              );


          // ==============================
          // ステータス適用
          // ==============================

          memberAppliedStatusIds.forEach(
            statusId => {

              const status =
                statuses.find(
                  status =>
                    status.id ===
                    statusId
                );


              if (status) {

                weight *=
                  discountToRatio(
                    status.discount
                  );

              }

            }
          );


          // ==============================
          // 個別調整
          // ==============================

          weight *=
            discountToRatio(
              individualDiscount
            );


          // ==============================
          // 参加者保存
          // ==============================

          participants.push({

            id:
              member.id,


            name:
              member.name,


            weight,


            individualDiscount,


            // この支払いで実際に
            // 発揮されたステータス
            appliedStatusIds:
              memberAppliedStatusIds

          });

        }
      );


    // ====================================
    // 対象者確認
    // ====================================

    if (
      participants.length === 0
    ) {

      alert(
        "対象者を選択してください"
      );

      return;

    }


    // ====================================
    // 支払者
    // ====================================

    const payerMember =
      members.find(
        member =>
          member.id === payerId
      );


    // ====================================
    // 新しい支払いデータ
    // ====================================

    const payment = {

      id:

        editingPayment

          ? editingPayment.id

          : crypto.randomUUID(),


      payerId,


      payerName:
        payerMember.name,


      amount:
        paymentAmount,


      description:
        paymentDescription,


      // 支払い全体で選択された
      // ステータスも保存
      appliedStatusIds,


      participants,


      createdAt:

        editingPayment

          ? editingPayment.createdAt

          : new Date().toISOString(),


      updatedAt:
        new Date().toISOString()

    };


    try {

      const eventRef =
        doc(
          db,
          "events",
          eventId
        );


      // ==================================
      // 編集
      // ==================================

      if (editingPayment) {

        const updatedPayments =
          payments.map(
            item =>

              item.id ===
              editingPayment.id

                ? payment

                : item
          );


        await updateDoc(

          eventRef,

          {

            payments:
              updatedPayments

          }

        );

      }


      // ==================================
      // 新規追加
      // ==================================

      else {

        await updateDoc(

          eventRef,

          {

            payments:
              arrayUnion(
                payment
              )

          }

        );

      }


      window.location.href =
        `event.html?id=${eventId}`;

    }

    catch (error) {

      console.error(error);


      alert(
        editingPayment

          ? "支払いの更新に失敗しました"

          : "支払いの保存に失敗しました"
      );

    }

  }
);


// ========================================
// 初期化
// ========================================

loadEvent();