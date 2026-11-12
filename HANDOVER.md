# 清算くん（Seisan-kun）引き継ぎ書

作成日：2026-11-08

## 1. プロジェクト概要

「清算くん」は、飲み会・イベントなどの立て替え精算を計算する静的Webアプリ。
ログイン機能はなく、**イベントIDを知っている人だけがそのイベントにアクセスできる**という
「URL自体がアクセス権」の設計になっている（この前提が各種設計判断のベースになっている）。

- フロントエンド：Vanilla JS（フレームワークなし）＋ Firebase Firestore（JS SDK, v12.18.0をCDN経由で利用）
- ホスティング：Netlify（静的サイト配信 ＋ Netlify Functions）
- モード：個人モード（membersで割り勘）／団体モード（groupsで割り勘）の2種類
- 最近追加した機能：レシート画像をAIに読み取らせて店名・金額を自動入力する「レシート読み取り」機能（進行中、詳細は4章）

## 2. ファイル構成と役割

| ファイル | 役割 |
|---|---|
| `index.html` / `home.js` | トップページ。イベント作成・一覧 |
| `event.html` / `event.js` | イベント詳細（ステータス・メンバー・グループ・支払い一覧の表示、Firestoreの`onSnapshot`でリアルタイム反映） |
| `payment.html` / `payment.js` | 個人モードの支払い追加・編集（割り勘／個別金額の2モード、レシート読み取りボタンあり） |
| `grouppayment.html` / `grouppayment.js` | 団体モードの支払い追加・編集（対象グループ選択、レシート読み取りボタンあり） |
| `firebase.js` | Firebase初期化（`initializeApp`/`getFirestore`のエクスポートのみ） |
| `style.css` | 全ページ共通スタイル |
| `firestore.rules` | **本番運用中の現行ルール**（4章参照、重要） |
| `firestore.rules.strict-backup` | 過去の失敗バージョンのバックアップ。**絶対に本番に使わないこと**（理由は5章） |
| `netlify.toml` | Netlify設定（`functions = "netlify/functions"`） |
| `receiptScan_tmp.js` | レシート画像をリサイズ→Functionへ送信→結果を返す共通処理（payment.js/grouppayment.jsの両方から呼ばれる） |
| `netlify/functions/scan-receipt.js` | レシート画像をAI（現状OpenAI gpt-4o-mini）に渡して店名・合計金額を読み取るサーバーレス関数 |
| `.env` | `OPENAI_API_KEY`が入ったファイル（Netlifyへのインポート用に一度発行したもの。5章の注意点を必読） |
| `migrate-event-ids.js` | イベントIDを旧形式→短縮形式に移行するための一回限りのNode/Admin SDKスクリプト（使用済み、今後不要） |
| `cleanup-legacy-ids.html` | テストデータの旧形式イベントを一括削除するための一回限りの管理ツール（使用済み。**サーバー上に残っていないか要確認、残っていれば削除すること**） |

## 3. アーキテクチャ上の重要な前提

- **アクセス制御はURL（イベントID）のみ**。ログイン機能がないため、Firestoreの`list`は常に`false`にしてコレクション全体の列挙を防いでいる（`get`のみ許可）。
- イベントIDは8桁のbase62短縮ID（`crypto.getRandomValues`＋棄却サンプリングで62進数の偏りを回避、生成後にFirestoreへの重複チェックあり）。
- `updateDoc()`による部分更新時、Firestoreルールの`request.resource.data`は**更新後の全フィールドを含むマージ済みドキュメント**になる（更新パッチそのものではない）。この性質を理解せずにルールを書くと、特定フィールドが来ていない通常の更新が弾かれる不具合を過去に2回起こしている（5章）。

## 4. レシート読み取り機能（現在の状況）

### アーキテクチャ
静的サイト＋Firestoreの構成では、ブラウザJSにOpenAIのAPIキーを直接置くと誰でも盗んで使い放題になるため、**Netlify Functions**を経由させている。

```
[ユーザー] → <input type=file> → receiptScan_tmp.js（canvasで縮小・JPEG圧縮）
  → POST /.netlify/functions/scan-receipt（Base64画像）
  → netlify/functions/scan-receipt.js（サーバー側、APIキーはNetlifyの環境変数）
  → OpenAI gpt-4o-mini Vision API
  → { store, total } をJSONで返す → フォームに自動入力
```

### 現在の実装状態
- **フロントエンド（ボタン・UI・画像縮小・呼び出し処理）は実装済み**：`payment.html`/`payment.js`、`grouppayment.html`/`grouppayment.js`、`receiptScan_tmp.js`、`style.css`の該当部分。
- **バックエンド（`netlify/functions/scan-receipt.js`）はOpenAI gpt-4o-mini版が実装済み**で、プロンプトは「お釣り・お預りを合計と誤認しない」ルールと`detail: "auto"`（速度・コスト重視）まで調整済み。
- 直近のセッションで「OpenAI以外のAIに変更したい」という話になり、**Anthropic Claude（Haiku 5.5）への切り替えが選択されたが、コードの書き換えはまだ着手していない**。Claude Messages APIの仕様調査は完了している（下記メモ参照）。

### Claude Haiku 5.5への切り替えメモ（未実装・調査済みの情報）
- モデルID：`claude-haiku-5-5`
- エンドポイント：`POST https://api.anthropic.com/v1/messages`
- 必須ヘッダー：`x-api-key`、`anthropic-version`（2026年11月時点の最新値は`2026-10-21`。要再確認）、`content-type: application/json`
- `max_tokens`が必須パラメータ（OpenAIと違い必須）
- 画像は`content`配列に`{type:"image", source:{type:"base64", media_type:"image/jpeg", data: "<data:...;base64,を除いた生のbase64文字列>"}}`を、テキストより前に置くことが推奨
- `response_format`のようなパラメータは無く、JSON出力はプロンプト指示で誘導する方式（または`output_config.format`のjson_schema機能、ベータ的機能のため今回は見送り推奨）
- 料金：Claude Haiku 5.5は入力$0.10/100万トークン（10万トークンまで）。Gemini 2.5 Flash-Liteも同程度（$0.10/100万トークン）で候補に残していた。

### ⚠️ 重要：現行のOpenAI gpt-4o-miniは廃止予定
2026年11月時点で確認した情報：

- `gpt-4o-mini`は**2026年10月14日に廃止（deprecated）が発表済み**
- **シャットダウン予定日：2027年1月14日**（それ以降はAPIが呼べなくなる）
- OpenAI推奨の移行先：`gpt-6-luna`（要公式ページで最新確認）

→ Claudeへの切り替えを見送ってOpenAIを使い続ける場合でも、**2027年1月14日より前にモデル名を変更する対応が別途必要**。

## 5. 重要な注意点・既知の問題

1. **`firestore.rules`は現在リーニエント（フィールド存在チェックが`('field' in data)`方式）な現行版を使うこと。** 過去に2回、フィールドを必須にした厳格な版に戻してしまい、「ステータス・支払いの編集ができなくなる」不具合を起こしている。`firestore.rules.strict-backup`は参考用の退避ファイルであり、**本番に適用しないこと**。
2. **OPENAI_API_KEYがこのチャットの会話ログ内に平文で複数回露出している。** 新しいプロジェクトに移行するタイミングで、OpenAI側でこのキーをローテーション（失効→再発行）し、Netlifyの環境変数も更新することを強く推奨。
3. Netlifyには現在2つのプロジェクトが存在する可能性がある：
   - `mr-seisan`（元のサイト、後からGit連携した）
   - `mr-seisan-2`（最初にテスト用に作った別プロジェクト）
   環境変数（`OPENAI_API_KEY`など）は**プロジェクトごとに個別設定が必要**（共有されない）。重複管理が煩雑なため、`mr-seisan`が問題なく動くことを確認できたら`mr-seisan-2`は削除して良い。
4. `cleanup-legacy-ids.html`は本番データを一括削除できる管理ツール。使用後にサーバー（公開ディレクトリ）から削除したか未確認。残っていれば削除すること。
5. GitHubへの直接プッシュについて：このセッションの`gh`コマンドの認証トークン（`GH_TOKEN`）が無効で、Claudeから直接pushすることができなかった。ファイルはすべて手動でGitHub Web UI経由（Upload files / Create new fileでの貼り替え）で反映してきた経緯がある。

## 6. 保留中・未対応タスク

- [ ] AIプロバイダの最終決定と実装（Claude Haiku 5.5へ切り替えるか、OpenAIのまま`gpt-6-luna`等へ移行するか）
- [ ] レシート機能のうちAPI以外のフロントエンド部分（`payment.html`/`payment.js`/`grouppayment.html`/`grouppayment.js`/`receiptScan_tmp.js`/`style.css`/`netlify.toml`）がGitHubの`kanqlabo/seisan`にまだ反映されていない可能性がある（ZIPで渡した状態で、反映済みか未確認）
- [ ] `netlify/functions/scan-receipt.js`（AI呼び出し部分）は未反映（プロバイダ決定後にアップロードする想定だった）
- [ ] OPENAI_API_KEYのローテーション（上記5章-2）
- [ ] `cleanup-legacy-ids.html`の削除確認（上記5章-4）
- [ ] `mr-seisan-2`の削除検討（上記5章-3）

## 7. この会話で確認済みの外部情報（2026年11月時点）

- OpenAI `gpt-4o-mini`：2026-10-14廃止予告、2027-01-14シャットダウン予定、推奨移行先`gpt-6-luna`（要再確認）
- Anthropic Claude Haiku 5.5：モデルID`claude-haiku-5-5`、入力$0.10/100万トークン（10万トークンまで）
- Google Gemini 2.5 Flash-Lite：入力$0.10/100万トークン（テキスト/画像/動画共通）
- Netlify：2025〜2026年頃からクレジット制のFree環境（月300クレジットの共有プール）に変更されている
- Netlifyの「Powered by Netlify」バッジ：2026年8月19日以降作成のFreeプランプロジェクトではデフォルトON、プロジェクト設定の個別トグルでOFFにできる（Drop配信かGit連携かとは無関係）
