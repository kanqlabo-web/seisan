// ========================================
// 清算くん
// ホーム / イベント編集
// ========================================


// ========================================
// Firebase
// ========================================

import { initializeApp } from
  "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";

import {
  getFirestore,
  doc,
  setDoc,
  getDoc
} from
  "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";


// ========================================
// Firebase設定
// ========================================

const firebaseConfig = {

  apiKey:
    "AIzaSyBKbP74L4MwAOhwFXFNZbd1DFFv9M68Awo",

  authDomain:
    "k-sha-kun.firebaseapp.com",

  projectId:
    "k-sha-kun",

  storageBucket:
    "k-sha-kun.firebasestorage.app",

  messagingSenderId:
    "573497625446",

  appId:
    "1:573497625446:web:e056913eecdb00cac7d6a7"

};


// ========================================
// Firebase初期化
// ========================================

const app =
  initializeApp(firebaseConfig);

const db =
  getFirestore(app);


// ========================================
// URL
// ========================================

const params =
  new URLSearchParams(
    window.location.search
  );


const eventId =
  params.get("id");


// ========================================
// データ
// ========================================

let currentMode =
  "individual";

let statuses = [];

let members = [];

let groups = [];

let payments = [];

let groupPayments = [];


// ========================================
// HTML要素
// ========================================

const eventName =
  document.getElementById(
    "eventName"
  );


// モード

const individualModeButton =
  document.getElementById(
    "individualModeButton"
  );

const groupModeButton =
  document.getElementById(
    "groupModeButton"
  );

const individualMode =
  document.getElementById(
    "individualMode"
  );

const groupMode =
  document.getElementById(
    "groupMode"
  );


// ステータス

const newStatusName =
  document.getElementById(
    "newStatusName"
  );

const newStatusDiscount =
  document.getElementById(
    "newStatusDiscount"
  );

const addStatusButton =
  document.getElementById(
    "addStatusButton"
  );

const statusList =
  document.getElementById(
    "statusList"
  );


// 参加者

const memberName =
  document.getElementById(
    "memberName"
  );

const memberStatusOptions =
  document.getElementById(
    "memberStatusOptions"
  );

const addMemberButton =
  document.getElementById(
    "addMemberButton"
  );

const memberList =
  document.getElementById(
    "memberList"
  );


// 団体

const groupName =
  document.getElementById(
    "groupName"
  );

const groupPeople =
  document.getElementById(
    "groupPeople"
  );

const groupBurden =
  document.getElementById(
    "groupBurden"
  );

const groupBasePrice =
  document.getElementById(
    "groupBasePrice"
  );

const groupActualPrice =
  document.getElementById(
    "groupActualPrice"
  );

const addGroupButton =
  document.getElementById(
    "addGroupButton"
  );

const groupList =
  document.getElementById(
    "groupList"
  );


// 最初の支払い

const groupFirstPaymentSection =
  document.getElementById(
    "groupFirstPaymentSection"
  );

const groupFirstPaymentEventNamePreview =
  document.getElementById(
    "groupFirstPaymentEventNamePreview"
  );

const groupFirstPaymentAmount =
  document.getElementById(
    "groupFirstPaymentAmount"
  );

const groupFirstPaymentPayerName =
  document.getElementById(
    "groupFirstPaymentPayerName"
  );


// ボタン

const createEventButton =
  document.getElementById(
    "createEventButton"
  );

const backToEventButton =
  document.getElementById(
    "backToEventButton"
  );


// ========================================
// ID生成
// ========================================

function createId() {

  return (

    Date.now().toString() +

    Math.random()
      .toString(16)
      .slice(2)

  );

}


// ========================================
// 割引表示
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


// ========================================
// 負担割合（参加グループ用）
// 負担割合(%) = 100 − 割引率(%)
// 例）割引率20% → 負担割合80%
// ========================================

const BURDEN_MIN = 0;

const BURDEN_MAX = 200;


function getGroupBurden(group) {

  if (
    group.burden !== undefined &&
    group.burden !== null &&
    group.burden !== ""
  ) {

    return Number(group.burden);

  }

  // 旧データ（discount保存）との互換
  return 100 - Number(group.discount || 0);

}


function formatBurden(burden) {

  return `負担割合 ${Math.round(Number(burden) * 100) / 100}%`;

}


// 実額から負担割合を逆算（小数第2位まで）
// 負担割合(%) = 実額 ÷ 基準額 × 100
function calcBurdenFromPrice(actualPrice, basePrice) {

  const actual =
    Number(actualPrice);

  const base =
    Number(basePrice);

  if (
    !base ||
    base <= 0 ||
    isNaN(actual) ||
    actual < 0
  ) {

    return null;

  }

  return Math.round(
    (actual / base) * 100 * 100
  ) / 100;

}


function updateBurdenFromActual() {

  if (groupActualPrice.value === "") {

    return;

  }

  const burden =
    calcBurdenFromPrice(
      groupActualPrice.value,
      groupBasePrice.value
    );

  if (burden === null) {

    return;

  }

  groupBurden.value =
    burden;

}


function createBurdenField(value = 100) {

  const field =
    document.createElement(
      "div"
    );

  field.className =
    "discount-field";

  const label =
    document.createElement(
      "span"
    );

  label.textContent =
    "負担割合";

  const input =
    document.createElement(
      "input"
    );

  input.type =
    "number";

  input.value =
    value;

  input.min =
    BURDEN_MIN;

  input.max =
    BURDEN_MAX;

  const percent =
    document.createElement(
      "span"
    );

  percent.textContent =
    "%";

  field.appendChild(label);

  field.appendChild(input);

  field.appendChild(percent);

  return { field, input };

}


// ========================================
// 割引率入力作成
// ========================================

function createDiscountField(value = 0) {

  const field =
    document.createElement(
      "div"
    );


  field.className =
    "discount-field";


  const label =
    document.createElement(
      "span"
    );


  label.textContent =
    "割引率";


  const input =
    document.createElement(
      "input"
    );


  input.type =
    "number";


  input.value =
    value;


  input.min =
    -100;


  input.max =
    100;


  const percent =
    document.createElement(
      "span"
    );


  percent.textContent =
    "%";


  field.appendChild(
    label
  );


  field.appendChild(
    input
  );


  field.appendChild(
    percent
  );


  return {

    field,

    input

  };

}


// ========================================
// 最初の支払い：イベント名プレビュー
// ========================================

function updateGroupFirstPaymentPreview() {

  if (!groupFirstPaymentEventNamePreview) {

    return;

  }


  groupFirstPaymentEventNamePreview.textContent =
    eventName.value.trim() ||
    "イベント名";

}


eventName.addEventListener(
  "input",
  updateGroupFirstPaymentPreview
);


updateGroupFirstPaymentPreview();


// ========================================
// モード切り替え
// ========================================

individualModeButton.addEventListener(
  "click",
  () => {

    currentMode =
      "individual";


    individualMode.style.display =
      "block";

    groupMode.style.display =
      "none";


    individualModeButton.classList.add(
      "active"
    );

    groupModeButton.classList.remove(
      "active"
    );

  }
);


groupModeButton.addEventListener(
  "click",
  () => {

    currentMode =
      "group";


    individualMode.style.display =
      "none";

    groupMode.style.display =
      "block";


    groupModeButton.classList.add(
      "active"
    );

    individualModeButton.classList.remove(
      "active"
    );

  }
);


// ========================================
// ステータス追加
// ========================================

addStatusButton.addEventListener(
  "click",
  () => {

    const name =
      newStatusName.value.trim();


    const discount =
      Number(
        newStatusDiscount.value
      );


    if (!name) {

      alert(
        "ステータス名を入力してください"
      );

      return;

    }


    if (

      newStatusDiscount.value === "" ||

      isNaN(discount) ||

      discount < -100 ||

      discount > 100

    ) {

      alert(
        "割引率は-100〜100で入力してください"
      );

      return;

    }


    statuses.push({

      id:
        createId(),

      name,

      discount

    });


    newStatusName.value =
      "";

    newStatusDiscount.value =
      "";


    renderIndividual();

  }
);


// ========================================
// ステータス一覧
// ========================================

function renderStatusList() {

  statusList.innerHTML =
    "";


  if (
    statuses.length === 0
  ) {

    statusList.innerHTML =
      `
      <p class="empty">
        ステータスはまだありません
      </p>
      `;

    return;

  }


  statuses.forEach(
    status => {

      const item =
        document.createElement(
          "div"
        );


      item.className =
        "list-item";


      item.innerHTML = `

        <div>

          <strong>
            ${status.name}
          </strong>

          <span>
            ${formatDiscount(
              status.discount
            )}
          </span>

        </div>

      `;


      const actions =
        document.createElement(
          "div"
        );


      actions.className =
        "item-actions";


      const editButton =
        document.createElement(
          "button"
        );


      editButton.textContent =
        "編集";


      const deleteButton =
        document.createElement(
          "button"
        );


      deleteButton.textContent =
        "削除";


      actions.appendChild(
        editButton
      );

      actions.appendChild(
        deleteButton
      );


      item.appendChild(
        actions
      );


      // 編集

      editButton.addEventListener(
        "click",
        () => {

          item.innerHTML =
            "";


          item.classList.add(
            "is-editing"
          );


          const nameInput =
            document.createElement(
              "input"
            );


          nameInput.value =
            status.name;


          const discountField =
            createDiscountField(
              status.discount
            );


          const editInputs =
            document.createElement(
              "div"
            );


          editInputs.className =
            "edit-inputs";


          editInputs.appendChild(
            nameInput
          );

          editInputs.appendChild(
            discountField.field
          );


          const saveButton =
            document.createElement(
              "button"
            );


          saveButton.textContent =
            "保存";


          const cancelButton =
            document.createElement(
              "button"
            );


          cancelButton.textContent =
            "キャンセル";


          const editActions =
            document.createElement(
              "div"
            );


          editActions.className =
            "edit-actions";


          editActions.appendChild(
            saveButton
          );

          editActions.appendChild(
            cancelButton
          );


          item.appendChild(
            editInputs
          );


          item.appendChild(
            editActions
          );


          saveButton.addEventListener(
            "click",
            () => {

              const newName =
                nameInput.value.trim();


              const newDiscount =
                Number(
                  discountField.input.value
                );


              if (!newName) {

                alert(
                  "名前を入力してください"
                );

                return;

              }


              if (

                discountField.input.value === "" ||

                isNaN(newDiscount) ||

                newDiscount < -100 ||

                newDiscount > 100

              ) {

                alert(
                  "割引率は-100〜100です"
                );

                return;

              }


              status.name =
                newName;


              status.discount =
                newDiscount;


              renderIndividual();

            }
          );


          cancelButton.addEventListener(
            "click",
            () => {

              renderIndividual();

            }
          );

        }
      );


      // 削除

      deleteButton.addEventListener(
        "click",
        () => {

          statuses =
            statuses.filter(
              item =>
                item.id !== status.id
            );


          members.forEach(
            member => {

              member.statuses =
                member.statuses.filter(
                  id =>
                    id !== status.id
                );

            }
          );


          renderIndividual();

        }
      );


      statusList.appendChild(
        item
      );

    }
  );

}


// ========================================
// ステータス選択肢
// ========================================

function renderMemberStatusOptions() {

  memberStatusOptions.innerHTML =
    "";


  if (
    statuses.length === 0
  ) {

    memberStatusOptions.innerHTML =
      `
      <p class="hint">
        ステータスを追加すると、
        参加者ごとに割引条件を設定できます
      </p>
      `;

    return;

  }


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


      memberStatusOptions.appendChild(
        label
      );

    }
  );

}


// ========================================
// 参加者追加
// ========================================

addMemberButton.addEventListener(
  "click",
  () => {

    const name =
      memberName.value.trim();


    if (!name) {

      alert(
        "名前を入力してください"
      );

      return;

    }


    const selectedStatuses =
      Array.from(

        memberStatusOptions.querySelectorAll(
          "input:checked"
        )

      ).map(
        checkbox =>
          checkbox.value
      );


    members.push({

      id:
        createId(),

      name,

      statuses:
        selectedStatuses

    });


    memberName.value =
      "";


    renderIndividual();

  }
);


// ========================================
// 参加者一覧
// ========================================

function renderMemberList() {

  memberList.innerHTML =
    "";


  if (
    members.length === 0
  ) {

    memberList.innerHTML =
      `
      <p class="empty">
        参加者はまだいません
      </p>
      `;

    return;

  }


  members.forEach(
    member => {

      const item =
        document.createElement(
          "div"
        );


      item.className =
        "list-item";


      const memberStatuses =
        member.statuses

          .map(
            id =>
              statuses.find(
                status =>
                  status.id === id
              )
          )

          .filter(Boolean);


      const statusNames =
        memberStatuses

          .map(
            status =>
              status.name
          )

          .join("・");


      const totalDiscount =
        memberStatuses.reduce(

          (sum, status) =>
            sum +
            Number(status.discount),

          0

        );


      item.innerHTML = `

        <div>

          <strong>
            ${member.name}
          </strong>

          <span>

            ${
              statusNames ||
              "ステータスなし"
            }

            ${
              memberStatuses.length > 0
                ? `（合計：${formatDiscount(totalDiscount)}）`
                : ""
            }

          </span>

        </div>

      `;


      const actions =
        document.createElement(
          "div"
        );


      actions.className =
        "item-actions";


      const editButton =
        document.createElement(
          "button"
        );


      editButton.textContent =
        "編集";


      const deleteButton =
        document.createElement(
          "button"
        );


      deleteButton.textContent =
        "削除";


      actions.appendChild(
        editButton
      );

      actions.appendChild(
        deleteButton
      );


      item.appendChild(
        actions
      );


      // 編集

      editButton.addEventListener(
        "click",
        () => {

          item.innerHTML =
            "";


          item.classList.add(
            "is-editing"
          );


          const editInputs =
            document.createElement(
              "div"
            );


          editInputs.className =
            "edit-inputs";


          const nameInput =
            document.createElement(
              "input"
            );


          nameInput.value =
            member.name;


          editInputs.appendChild(
            nameInput
          );


          const statusOptions =
            document.createElement(
              "div"
            );


          statusOptions.className =
            "checkbox-container";


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

              checkbox.checked =
                member.statuses.includes(
                  status.id
                );


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


              statusOptions.appendChild(
                label
              );

            }
          );


          editInputs.appendChild(
            statusOptions
          );


          item.appendChild(
            editInputs
          );


          const saveButton =
            document.createElement(
              "button"
            );


          saveButton.textContent =
            "保存";


          const cancelButton =
            document.createElement(
              "button"
            );


          cancelButton.textContent =
            "キャンセル";


          const editActions =
            document.createElement(
              "div"
            );


          editActions.className =
            "edit-actions";


          editActions.appendChild(
            saveButton
          );

          editActions.appendChild(
            cancelButton
          );


          item.appendChild(
            editActions
          );


          saveButton.addEventListener(
            "click",
            () => {

              const newName =
                nameInput.value.trim();


              if (!newName) {

                alert(
                  "名前を入力してください"
                );

                return;

              }


              member.name =
                newName;


              member.statuses =
                Array.from(

                  item.querySelectorAll(
                    'input[type="checkbox"]:checked'
                  )

                ).map(
                  checkbox =>
                    checkbox.value
                );


              renderIndividual();

            }
          );


          cancelButton.addEventListener(
            "click",
            () => {

              renderIndividual();

            }
          );

        }
      );


      // 削除

      deleteButton.addEventListener(
        "click",
        () => {

          members =
            members.filter(
              item =>
                item.id !== member.id
            );


          renderIndividual();

        }
      );


      memberList.appendChild(
        item
      );

    }
  );

}


// ========================================
// 個人モード描画
// ========================================

function renderIndividual() {

  renderStatusList();

  renderMemberStatusOptions();

  renderMemberList();

}


// ========================================
// 参加グループ追加
// ========================================

groupActualPrice.addEventListener(
  "input",
  updateBurdenFromActual
);

groupBasePrice.addEventListener(
  "input",
  updateBurdenFromActual
);



addGroupButton.addEventListener(
  "click",
  () => {

    const name =
      groupName.value.trim();


    const people =
      Number(
        groupPeople.value
      );


    // 実額が入力されている場合は、基準額から負担割合を逆算する
    if (groupActualPrice.value !== "") {

      const calculated =
        calcBurdenFromPrice(
          groupActualPrice.value,
          groupBasePrice.value
        );

      if (calculated === null) {

        alert(
          "実額から逆算するには、基準額（1円以上）を入力してください"
        );

        return;

      }

      groupBurden.value =
        calculated;

    }


    // 未入力は100%（通常どおり）として扱う
    const burden =
      groupBurden.value === "" ?
        100 :
        Number(
          groupBurden.value
        );


    if (!name) {

      alert(
        "参加グループ名を入力してください"
      );

      return;

    }


    if (
      !people ||
      people <= 0
    ) {

      alert(
        "人数を入力してください"
      );

      return;

    }


    if (

      isNaN(burden) ||

      burden < BURDEN_MIN ||

      burden > BURDEN_MAX

    ) {

      alert(
        `負担割合は${BURDEN_MIN}〜${BURDEN_MAX}%で入力してください`
      );

      return;

    }


    groups.push({

      id:
        createId(),

      name,

      people,

      burden

    });


    groupName.value =
      "";

    groupPeople.value =
      "";

    groupBurden.value =
      "";

    groupActualPrice.value =
      "";


    renderGroup();

  }
);


// ========================================
// 団体一覧
// ========================================

function renderGroup() {

  groupList.innerHTML =
    "";


  if (
    groups.length === 0
  ) {

    groupList.innerHTML =
      `
      <p class="empty">
        参加グループはまだありません
      </p>
      `;

    return;

  }


  groups.forEach(
    group => {

      const item =
        document.createElement(
          "div"
        );


      item.className =
        "list-item";


      item.innerHTML = `

        <div>

          <strong>
            ${group.name}
          </strong>

          <span>

            ${group.people}人
            ・
            ${formatBurden(
              getGroupBurden(group)
            )}

          </span>

        </div>

      `;


      const actions =
        document.createElement(
          "div"
        );


      actions.className =
        "item-actions";


      const editButton =
        document.createElement(
          "button"
        );


      editButton.textContent =
        "編集";


      const deleteButton =
        document.createElement(
          "button"
        );


      deleteButton.textContent =
        "削除";


      actions.appendChild(
        editButton
      );

      actions.appendChild(
        deleteButton
      );


      item.appendChild(
        actions
      );


      // 編集

      editButton.addEventListener(
        "click",
        () => {

          item.innerHTML =
            "";


          item.classList.add(
            "is-editing"
          );


          const nameInput =
            document.createElement(
              "input"
            );


          nameInput.value =
            group.name;


          const peopleInput =
            document.createElement(
              "input"
            );


          peopleInput.type =
            "number";

          peopleInput.value =
            group.people;


          const burdenField =
            createBurdenField(
              getGroupBurden(group)
            );


          const editInputs =
            document.createElement(
              "div"
            );


          editInputs.className =
            "edit-inputs";


          editInputs.appendChild(
            nameInput
          );

          editInputs.appendChild(
            peopleInput
          );

          editInputs.appendChild(
            burdenField.field
          );


          // 実額から逆算（基準額が設定されている場合）
          const actualEditInput =
            document.createElement(
              "input"
            );

          actualEditInput.type =
            "number";

          actualEditInput.min =
            0;

          actualEditInput.step =
            "any";

          actualEditInput.placeholder =
            "実額から逆算（円）";

          actualEditInput.addEventListener(
            "input",
            () => {

              const calculated =
                calcBurdenFromPrice(
                  actualEditInput.value,
                  groupBasePrice.value
                );

              if (calculated !== null) {

                burdenField.input.value =
                  calculated;

              }

            }
          );

          editInputs.appendChild(
            actualEditInput
          );


          const saveButton =
            document.createElement(
              "button"
            );


          saveButton.textContent =
            "保存";


          const cancelButton =
            document.createElement(
              "button"
            );


          cancelButton.textContent =
            "キャンセル";


          const editActions =
            document.createElement(
              "div"
            );


          editActions.className =
            "edit-actions";


          editActions.appendChild(
            saveButton
          );

          editActions.appendChild(
            cancelButton
          );


          item.appendChild(
            editInputs
          );

          item.appendChild(
            editActions
          );


          saveButton.addEventListener(
            "click",
            () => {

              const newName =
                nameInput.value.trim();


              const newPeople =
                Number(
                  peopleInput.value
                );


              const newBurden =
                Number(
                  burdenField.input.value
                );


              if (

                !newName ||

                !newPeople ||

                newPeople <= 0 ||

                burdenField.input.value === "" ||

                isNaN(newBurden) ||

                newBurden < BURDEN_MIN ||

                newBurden > BURDEN_MAX

              ) {

                alert(
                  "入力内容を確認してください"
                );

                return;

              }


              group.name =
                newName;

              group.people =
                newPeople;

              group.burden =
                newBurden;

              // 旧データのdiscountは残さない
              delete group.discount;


              renderGroup();

            }
          );


          cancelButton.addEventListener(
            "click",
            () => {

              renderGroup();

            }
          );

        }
      );


      // 削除

      deleteButton.addEventListener(
        "click",
        () => {

          groups =
            groups.filter(
              item =>
                item.id !== group.id
            );


          renderGroup();

        }
      );


      groupList.appendChild(
        item
      );

    }
  );

}


// ========================================
// イベント作成 / 保存
// ========================================

createEventButton.addEventListener(
  "click",
  async () => {

    const name =
      eventName.value.trim();


    if (!name) {

      alert(
        "イベント名を入力してください"
      );

      return;

    }


    const isNewEvent =
      !eventId;


    let id =
      eventId;


    if (!id) {

      id =
        createId();

    }


    // ------------------------------------
    // 最初の支払い（団体モード・新規作成時のみ）
    // ------------------------------------

    if (
      isNewEvent &&
      currentMode === "group" &&
      groupFirstPaymentAmount &&
      groupFirstPaymentAmount.value !== ""
    ) {

      const firstPaymentAmount =
        Number(
          groupFirstPaymentAmount.value
        );


      if (
        !firstPaymentAmount ||
        firstPaymentAmount <= 0
      ) {

        alert(
          "最初の支払いの金額を正しく入力してください"
        );

        return;

      }


      groupPayments = [

        ...groupPayments,

        {

          id:
            createId(),

          amount:
            firstPaymentAmount,

          // 内容はイベント名を自動的に使用
          description:
            name,

          payerName:
            groupFirstPaymentPayerName ?
              groupFirstPaymentPayerName.value.trim() :
              ""

        }

      ];

    }


    const eventRef =
      doc(
        db,
        "events",
        id
      );


    try {

      await setDoc(

        eventRef,

        {

          name,

          mode:
            currentMode,

          statuses,

          members,

          groups,

          // 逆算用の基準額（未入力は null）
          basePrice:
            groupBasePrice.value === "" ?
              null :
              Number(
                groupBasePrice.value
              ),

          payments,

          groupPayments

        },

        {
          merge: true
        }

      );


      location.href =
        `event.html?id=${id}`;

    }

    catch (error) {

      console.error(
        error
      );


      alert(
        "保存に失敗しました"
      );

    }

  }
);


// ========================================
// イベントページに戻る
// ========================================

backToEventButton.addEventListener(
  "click",
  () => {

    if (!eventId) {

      return;

    }


    location.href =
      `event.html?id=${eventId}`;

  }
);


// ========================================
// 既存イベント読み込み
// ========================================

async function loadEvent() {

  if (!eventId) {

    renderIndividual();

    renderGroup();

    return;

  }


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


      location.href =
        "index.html";

      return;

    }


    const data =
      snapshot.data();


    eventName.value =
      data.name || "";


    currentMode =
      data.mode ||
      "individual";


    statuses =
      data.statuses || [];

    members =
      data.members || [];

    groups =
      data.groups || [];

    if (
      data.basePrice !== undefined &&
      data.basePrice !== null
    ) {

      groupBasePrice.value =
        data.basePrice;

    }

    payments =
      data.payments || [];

    groupPayments =
      data.groupPayments || [];


    if (
      currentMode === "group"
    ) {

      individualMode.style.display =
        "none";

      groupMode.style.display =
        "block";


      groupModeButton.classList.add(
        "active"
      );

      individualModeButton.classList.remove(
        "active"
      );

    }


    createEventButton.textContent =
      "変更を保存";


    backToEventButton.style.display =
      "inline-block";


    // 既存イベントでは「最初の支払い」は使わない
    // （支払いの追加はイベントページから行うため）

    if (groupFirstPaymentSection) {

      groupFirstPaymentSection.style.display =
        "none";

    }


    renderIndividual();

    renderGroup();

  }

  catch (error) {

    console.error(
      error
    );


    alert(
      "イベントの読み込みに失敗しました"
    );

  }

}


// ========================================
// 初期化
// ========================================

loadEvent();