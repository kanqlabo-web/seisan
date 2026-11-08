// ========================================
// 清算くん
// 団体モード：支払い追加
// ========================================


// ========================================
// Firebase
// ========================================

import { initializeApp } from
  "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";

import {
  getFirestore,
  doc,
  getDoc,
  updateDoc
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
// URLからイベントID取得
// ========================================

const params =
  new URLSearchParams(
    window.location.search
  );

const eventId =
  params.get("id");


// ========================================
// HTML要素
// ========================================

const descriptionInput =
  document.getElementById(
    "description"
  );

const amountInput =
  document.getElementById(
    "amount"
  );

const payerNameInput =
  document.getElementById(
    "payerName"
  );

const addPaymentButton =
  document.getElementById(
    "addPaymentButton"
  );

const backButton =
  document.getElementById(
    "backButton"
  );


// ========================================
// イベントID確認
// ========================================

if (!eventId) {

  alert(
    "イベントが指定されていません"
  );

  location.href =
    "index.html";

}


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
// 支払い追加
// ========================================

addPaymentButton.addEventListener(
  "click",
  async () => {

    const description =
      descriptionInput.value.trim();

    const amount =
      Number(
        amountInput.value
      );

    const payerName =
      payerNameInput.value.trim();


    // ------------------------------------
    // 入力チェック
    // ------------------------------------

    if (
      !amount ||
      amount <= 0
    ) {

      alert(
        "正しい金額を入力してください"
      );

      return;

    }


    // ------------------------------------
    // イベント取得
    // ------------------------------------

    const eventRef =
      doc(
        db,
        "events",
        eventId
      );


    try {

      const snapshot =
        await getDoc(
          eventRef
        );


      if (
        !snapshot.exists()
      ) {

        alert(
          "イベントが見つかりません"
        );

        return;

      }


      const eventData =
        snapshot.data();


      // ----------------------------------
      // 団体モード確認
      // ----------------------------------

      if (
        eventData.mode !== "group"
      ) {

        alert(
          "このイベントは団体モードではありません"
        );

        return;

      }


      // ----------------------------------
      // 既存支払い取得
      // ----------------------------------

      const groupPayments =
        eventData.groupPayments ||
        [];


      // ----------------------------------
      // 支払いデータ作成
      // ----------------------------------

      const newPayment = {

        id:
          createId(),

        amount,

        description,

        // 建て替えた人
        payerName

      };


      // ----------------------------------
      // Firebase更新
      // ----------------------------------

      await updateDoc(

        eventRef,

        {

          groupPayments: [

            ...groupPayments,

            newPayment

          ]

        }

      );


      // ----------------------------------
      // 完了
      // ----------------------------------

      location.href =
        `event.html?id=${eventId}`;

    }

    catch (error) {

      console.error(
        error
      );

      alert(
        "支払いの追加に失敗しました"
      );

    }

  }
);


// ========================================
// 戻る
// ========================================

backButton.addEventListener(
  "click",
  () => {

    location.href =
      `event.html?id=${eventId}`;

  }
);