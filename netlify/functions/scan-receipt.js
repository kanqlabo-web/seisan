// netlify/functions/scan-receipt.js
//
// レシート画像をOpenAI（gpt-4o-mini・Vision）に渡し、店名と合計金額を読み取って返す
// サーバーレス関数。清算くんはFirestoreを使った静的サイトでサーバーを持たないため、
// OpenAIのAPIキーをクライアント側（ブラウザのJS）に直接置くことはできない
// （誰でも盗んで使い放題になってしまう）。そのためこの関数を経由させ、
// APIキーはNetlify側の環境変数としてサーバー側だけに保持する。
//
// 事前準備：Netlifyのサイト設定 → Environment variables に
//   OPENAI_API_KEY = sk-... （OpenAIのAPIキー）
// を登録しておくこと。このファイル自体にはキーを書かない。
//
// npmパッケージには依存していない（Netlify Functionsのnode runtimeに
// 標準搭載されているfetchだけで完結させている）ため、追加のnpm installは不要。

const MAX_IMAGE_BASE64_LENGTH = 8 * 1024 * 1024; // 送信データが大きすぎる場合の目安の上限（base64換算で約8MB）

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "POSTのみ対応しています" });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("OPENAI_API_KEY is not set");
    return jsonResponse(500, { error: "サーバー側の設定が不足しています（OPENAI_API_KEY未設定）" });
  }

  let image;
  try {
    const body = JSON.parse(event.body || "{}");
    image = body.image;
  } catch (e) {
    return jsonResponse(400, { error: "リクエストの形式が不正です" });
  }

  if (!image || typeof image !== "string" || !image.startsWith("data:image/")) {
    return jsonResponse(400, { error: "画像データがありません" });
  }
  if (image.length > MAX_IMAGE_BASE64_LENGTH) {
    return jsonResponse(413, { error: "画像サイズが大きすぎます" });
  }

  const prompt = `あなたはレシート読み取りアシスタントです。画像から「店名」と「支払い合計金額」を読み取ってください。

レシートには小計・消費税・合計・お預り・お釣りなど、複数の金額が並んでいることがあります。
「支払い合計金額」を判断する際は、次の優先順位を必ず守ってください。
1. 「合計」「お会計」「御会計」「計」というラベルの隣にある金額を最優先で採用する。
2. 「お釣り」「おつり」「お預り」「お預かり」とラベルされた金額は、支払い合計ではないため絶対に採用しない（間違えやすいので特に注意する）。
3. 「合計」表記が複数ある場合は、消費税を含んだ最終的な金額（一番下に近い方）を採用する。

【ルール】
1. 店名はスペースを含めない形式に整形してください。
2. 合計金額は数字のみ（円マークや桁区切りのカンマなし）で返してください。
3. 読み取れない場合は店名を空文字、金額を0にしてください。
4. JSONのみで回答してください。解説は不要です。

回答形式: {"store":"店名","total":1234}`;

  try {
    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: image, detail: "auto" } }
          ]
        }],
        response_format: { type: "json_object" }
      })
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      console.error("OpenAI API error:", openaiRes.status, errText);
      return jsonResponse(502, { error: "AIによる解析に失敗しました" });
    }

    const data = await openaiRes.json();
    const content = data.choices?.[0]?.message?.content;
    const parsed = JSON.parse(content);

    const store = typeof parsed.store === "string" ? parsed.store.replace(/[\s　]/g, "").trim() : "";
    const totalNum = Number(parsed.total);
    const total = Number.isFinite(totalNum) ? Math.max(0, Math.round(totalNum)) : 0;

    return jsonResponse(200, { store, total });
  } catch (e) {
    console.error("scan-receipt error:", e);
    return jsonResponse(500, { error: "解析中にエラーが発生しました" });
  }
};

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  };
}
