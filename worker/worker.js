/**
 * Cloudflare Worker — "המוח" של הצ'אטבוט של לירון.
 * מחזיק את מפתח ה-API של Gemini בצד השרת (בטוח), ומקבל בקשות מהאפליקציה בטלפון.
 * משתמש ב-Gemini במקום Claude כדי שהשימוש יהיה לגמרי בחינם (Google AI Studio, ללא כרטיס אשראי).
 *
 * פריסה (ראו README.md לפרטים מלאים):
 *   1. npm install -g wrangler
 *   2. wrangler login
 *   3. wrangler deploy   (מריצים מהתיקייה הזו)
 *   4. wrangler secret put GEMINI_API_KEY   (מדביקים את המפתח כשמבקשים)
 *
 * לאחר הפריסה תקבלו כתובת כמו: https://liron-pcos-bot.<שם-המשתמש>.workers.dev
 * את הכתובת הזו מדביקים בקובץ index.html במקום REPLACE_WITH_YOUR_WORKER_URL
 */

// אם בעתיד גוגל תשנה שם למודל, עדכנו כאן. רשימת מודלים עדכנית: ai.google.dev/gemini-api/docs/models
const MODEL = "gemini-flash-latest";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

// לאחר שיש לכם את כתובת ה-GitHub Pages הסופית, אפשר (לא חובה) לצמצם לכתובת הזו בלבד
// לדוגמה: const ALLOWED_ORIGINS = ["https://username.github.io"];
const ALLOWED_ORIGINS = ["*"];

function corsHeaders(origin) {
  const allowOrigin = ALLOWED_ORIGINS.includes("*") ? "*" : (ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]);
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const headers = corsHeaders(origin);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers });
    }
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ text: "רק בקשות POST נתמכות." }), {
        status: 405,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    try {
      const body = await request.json();
      const prompt = String(body.prompt || "").slice(0, 4000);
      const context = body.context || {};

      if (!prompt) {
        return new Response(JSON.stringify({ text: "לא התקבלה שאלה." }), {
          status: 400,
          headers: { ...headers, "Content-Type": "application/json" },
        });
      }

      const userMessage = context && Object.keys(context).length
        ? `${prompt}\n\n[נתונים נלווים: ${JSON.stringify(context)}]`
        : prompt;

      const geminiRes = await fetch(`${GEMINI_URL}?key=${env.GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: userMessage }] }],
          generationConfig: { maxOutputTokens: 400, temperature: 0.8 },
        }),
      });

      if (!geminiRes.ok) {
        const errText = await geminiRes.text();
        console.error("Gemini API error:", geminiRes.status, errText);
        return new Response(JSON.stringify({ text: "הייתה בעיה זמנית בשירות. נסי שוב עוד רגע 💗" }), {
          status: 200,
          headers: { ...headers, "Content-Type": "application/json" },
        });
      }

      const data = await geminiRes.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
        || "לא הצלחתי לנסח תשובה כרגע, נסי לשאול שוב במילים אחרות.";

      return new Response(JSON.stringify({ text }), {
        headers: { ...headers, "Content-Type": "application/json" },
      });
    } catch (e) {
      console.error("Worker error:", e);
      return new Response(JSON.stringify({ text: "שגיאה זמנית. נסי שוב בעוד רגע." }), {
        status: 200,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }
  },
};
