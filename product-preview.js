exports.handler = async (event) => {
  const headers = { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "POST 요청만 지원해요." }) };
  try {
    const body = JSON.parse(event.body || "{}");
    const input = String(body.url || "");
    const target = new URL(input);
    if (!["http:", "https:"].includes(target.protocol)) throw new Error("http 또는 https 링크만 지원해요.");
    const host = target.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".local") ||
        /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) throw new Error("접근할 수 없는 주소예요.");
    const page = await fetch(target.toString(), {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36", "Accept": "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(15000), redirect: "follow"
    });
    if (!page.ok) throw new Error("상품 페이지에 접속하지 못했어요. 쇼핑몰에서 자동 수집을 제한했을 수 있어요.");
    const html = (await page.text()).slice(0, 3_000_000);
    const decode = (v) => String(v || "").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n))).replace(/&nbsp;/g," ").replace(/\\u002F/g,"/").replace(/\\\//g,"/").trim();
    const meta = (key) => {
      const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const patterns = [
        new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
        new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, "i")
      ];
      for (const re of patterns) { const m = html.match(re); if (m) return decode(m[1]); }
      return "";
    };
    const title = meta("og:title") || meta("twitter:title") || decode((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||"");
    let image = meta("og:image") || meta("og:image:url") || meta("twitter:image") || "";
    // 오늘의집 상품 갤러리는 CDN 이미지 주소가 HTML 안에 여러 형태로 들어갈 수 있어 후보를 추가 탐색
    if (!image && /ohouse\.kr|ohou\.se|ohousecdn\.com/i.test(target.hostname)) {
      const candidates = [...html.matchAll(/(?:https?:)?(?:\\\/\\\/|\/\/)?(?:prs|image)\.ohousecdn\.com[^"'\\\s<>]+?\.(?:jpg|jpeg|png|webp)(?:\?[^"'\\\s<>]*)?/gi)]
        .map(m => decode(m[0]).replace(/^\/\//,"https://").replace(/^https?:\/(?!\/)/,"https://"));
      image = candidates.find(u => /productions|goods|images/i.test(u)) || candidates[0] || "";
    }
    if (image) { try { image = new URL(decode(image), target).toString(); } catch (_) { image = ""; } }
    const rawPrice = meta("product:price:amount") || meta("og:price:amount") || "";
    let price = null;
    const priceMatch = String(rawPrice).replace(/,/g,"").match(/\d{2,}/);
    if (priceMatch) price = Number(priceMatch[0]);
    // 상품 상세 HTML의 JSON-LD offer 가격도 확인
    if (price === null) {
      const offers = html.match(/"(?:price|lowPrice)"\s*:\s*"?([\d,]+(?:\.\d+)?)"?/i);
      if (offers) { const n = Number(offers[1].replace(/,/g,"")); if (Number.isFinite(n) && n >= 100) price = Math.round(n); }
    }
    let imageData = "";
    if (image) {
      try {
        const ir = await fetch(image, { headers: { "User-Agent": "Mozilla/5.0", "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8", "Referer": target.origin + "/" }, signal: AbortSignal.timeout(12000), redirect: "follow" });
        const type = (ir.headers.get("content-type") || "").split(";")[0].toLowerCase();
        const len = Number(ir.headers.get("content-length") || 0);
        if (ir.ok && /^image\/(png|jpeg|webp|gif)$/.test(type) && (!len || len <= 3_000_000)) {
          const buf = Buffer.from(await ir.arrayBuffer());
          if (buf.length <= 3_000_000) imageData = `data:${type};base64,${buf.toString("base64")}`;
        }
      } catch (_) {}
    }
    return { statusCode: 200, headers, body: JSON.stringify({ title, price, imageData, imageFound: !!imageData, imageUrl: image || "" }) };
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: e.message || "상품 정보를 가져오지 못했어요." }) };
  }
};
