// receiptScan.js
// レシート画像を読み取り、店名・合計金額を取得する共通処理。
// payment.js（個人モード）・grouppayment.js（団体モード）の両方から使う。

// 送信前に画像を縮小・JPEG圧縮する（通信量とAPI利用コストを抑えるため）
function resizeImageToDataURL(file, maxWidth = 1600, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("ファイルの読み込みに失敗しました"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("画像の読み込みに失敗しました"));
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// file（レシート画像）をAIに解析させ、{store, total} を返す
export async function scanReceipt(file) {
  const dataUrl = await resizeImageToDataURL(file);

  const res = await fetch("/.netlify/functions/scan-receipt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: dataUrl })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "レシートの解析に失敗しました");

  return { store: data.store || "", total: data.total || 0 };
}
