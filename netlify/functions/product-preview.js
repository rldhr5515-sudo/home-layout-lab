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
      headers: { "User-Agent": "Mozilla/5.0 (compatible; HomeLayoutLab/1.0)", "Accept": "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(12000), redirect: "follow"
    });
    if (!page.ok) throw new Error("상품 페이지에 접속하지 못했어요. 사이트에서 자동 수집을 막았을 수 있어요.");
    const html = (await page.text()).slice(0, 2_000_000);
    const decode = (v) => String(v || "").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n))).replace(/&nbsp;/g," ").trim();
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
    let image = meta("og:image") || meta("twitter:image");
    if (image) image = new URL(image, target).toString();
    const rawPrice = meta("product:price:amount") || meta("og:price:amount") || meta("twitter:label1");
    const priceMatch = String(rawPrice).replace(/,/g,"").match(/\d{2,}/);
    const price = priceMatch ? Number(priceMatch[0]) : null;
    let imageData = "";
    if (image) {
      try {
        const ir = await fetch(image, { headers: { "User-Agent": "Mozilla/5.0", "Accept": "image/*" }, signal: AbortSignal.timeout(10000), redirect: "follow" });
        const type = (ir.headers.get("content-type") || "").split(";")[0];
        const len = Number(ir.headers.get("content-length") || 0);
        if (ir.ok && /^image\/(png|jpeg|webp|gif)$/.test(type) && (!len || len <= 2_500_000)) {
          const buf = Buffer.from(await ir.arrayBuffer());
          if (buf.length <= 2_500_000) imageData = `data:${type};base64,${buf.toString("base64")}`;
        }
      } catch (_) {}
    }
    return { statusCode: 200, headers, body: JSON.stringify({ title, price, imageData, imageFound: !!imageData }) };
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: e.message || "상품 정보를 가져오지 못했어요." }) };
  }
};
