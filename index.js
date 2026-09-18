const express = require("express");
const crypto = require("crypto");

const app = express();
app.use(express.json({ limit: "1mb", verify: (req, _res, buffer) => { req.rawBody = buffer; } }));

function env(name, ...aliases) {
  for (const key of [name, ...aliases]) {
    const value = process.env[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

const PORT = Number(process.env.PORT || 3000);
const GRAPH_API_VERSION = env("GRAPH_API_VERSION") || "v23.0";
const WHATSAPP_TOKEN = env("WHATSAPP_TOKEN", "META_ACCESS_TOKEN");
const VERIFY_TOKEN = env("VERIFY_TOKEN", "META_VERIFY_TOKEN");
const PHONE_NUMBER_ID = env("PHONE_NUMBER_ID", "WHATSAPP_PHONE_NUMBER_ID");
const META_APP_SECRET = env("META_APP_SECRET", "META_SECRET");
const AI_PROVIDER = (env("AI_PROVIDER") || "gemini").toLowerCase();
const OPENAI_API_KEY = env("OPENAI_API_KEY", "OPENAI_KEY", "AI_API_KEY");
const GEMINI_API_KEY = env("GEMINI_API_KEY", "GEMINI_KEY", "AI_API_KEY");
const AI_MODEL = env("AI_MODEL") || "gpt-4o-mini";
const GEMINI_MODEL = env("GEMINI_MODEL") || "gemini-2.5-flash";
const SUPABASE_URL = env("SUPABASE_URL");
const SUPABASE_KEY = env("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_KEY");
const processedMessageIds = new Map();
const conversations = new Map();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || crypto.randomBytes(32).toString("hex");
const ADMIN_WHATSAPP_NUMBERS = new Set(String(process.env.ADMIN_WHATSAPP_NUMBERS || "").split(",").map((value) => value.trim().replace(/\D/g, "")).filter(Boolean));
const adminSessions = new Map();
const loginAttempts = new Map();
const whatsappTrainingMode = new Set();

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cache-Control", "no-store");
  if (req.path.startsWith("/admin")) res.setHeader("Content-Security-Policy", "default-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  next();
});

const SYSTEM_PROMPT = `أنت مساعد خدمة عملاء يمثل أصيل محمد عبدالله مساعد الجعوري. متخصص في تقنية المعلومات، نشر المشاريع السحابية مثل Netlify وSupabase، أنظمة ERP مثل Onyx وZoho وOdoo، الشبكات وكاميرات المراقبة، نقاط البيع للمطاعم، والخدمات العامة في السعودية مثل ZATCA ومنصة قوى.
أجب بالعربية افتراضيًا وبأسلوب مهني ودود ومختصر. اعتمد على سياق قاعدة المعرفة المرفق فقط ولا تخترع أسعارًا أو مواعيد أو ضمانات. عند طلب سعر أو حجز، اجمع اسم العميل والخدمة والمدينة والوقت المناسب واذكر أن الفريق سيؤكد التفاصيل. لا تقدم استشارة قانونية أو ضريبية نهائية. لا تطلب كلمات مرور أو رموز وصول أو أرقام بطاقات. إذا طلب العميل موظفًا أو كانت المسألة شكوى أو عقدًا أو بيانات حساسة، قل: سأحوّل طلبك إلى فريق خدمة العملاء لمراجعة التفاصيل معك. عند عدم معرفة الإجابة قل بوضوح إن الفريق سيؤكدها.`;

const knowledge = `الخدمات تشمل: نشر واستضافة المواقع، Netlify وSupabase، الأتمتة والتكاملات، أنظمة ERP والأنظمة المالية Onyx وZoho وOdoo، الشبكات وكاميرات المراقبة، أنظمة نقاط البيع POS للمطاعم، إدارة المخزون والتكاليف، الخدمات الإلكترونية، الفوترة الإلكترونية ZATCA، منصة قوى، التسويق الرقمي، إدارة الجودة، وتطوير الأعمال. الموقع: https://cool-narwhal-7ce84a.netlify.app. رقم التواصل: +966504624380. البريد: aljaowrryasealmohamad@gmail.com.`;
let liveBotInstructions = SYSTEM_PROMPT;
let liveKnowledge = knowledge;

function configStatus() {
  return {
    whatsapp: Boolean(WHATSAPP_TOKEN && VERIFY_TOKEN && PHONE_NUMBER_ID),
    ai: Boolean((AI_PROVIDER === "openai" ? OPENAI_API_KEY : GEMINI_API_KEY)),
    supabase: Boolean(SUPABASE_URL && SUPABASE_KEY),
  };
}

function verifyMetaSignature(req) {
  if (!META_APP_SECRET) return true;
  const signature = req.get("x-hub-signature-256") || "";
  if (!signature.startsWith("sha256=")) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", META_APP_SECRET).update(req.rawBody || Buffer.from(JSON.stringify(req.body))).digest("hex");
  if (signature.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

function extractIncoming(body) {
  const value = body?.entry?.[0]?.changes?.[0]?.value;
  const message = value?.messages?.[0];
  if (!message || message.type !== "text" || !message.from || !message.text?.body) return null;
  return { from: message.from, text: message.text.body.trim(), messageId: message.id, name: value?.contacts?.[0]?.profile?.name || "" };
}

function extractIncomingMessages(body) {
  const messages = [];
  for (const entry of body?.entry || []) for (const change of entry?.changes || []) {
    const value = change?.value || {};
    for (const message of value.messages || []) {
      if (message.type === "text" && message.from && message.text?.body) {
        messages.push({ from: message.from, text: message.text.body.trim(), messageId: message.id, name: value.contacts?.find((c) => c.wa_id === message.from)?.profile?.name || "" });
      }
    }
  }
  return messages;
}

async function supabaseRequest(path, options = {}) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", ...(options.headers || {}) },
  });
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${await response.text()}`);
  return response.status === 204 ? null : response.json();
}

async function saveMetaEvent(body, status = "received", errorMessage = null) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;
  try {
    const eventId = body?.entry?.[0]?.id || body?.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id || `meta-${Date.now()}`;
    await supabaseRequest("webhook_events", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ provider: "meta-whatsapp", event_id: `${eventId}-${Date.now()}`, payload: body, status, error_message: errorMessage }) });
  } catch (error) { console.error("Meta event save failed:", error.message); }
}

async function saveMetaUser(incoming) {
  if (!SUPABASE_URL || !SUPABASE_KEY || !incoming?.from) return;
  try {
    await supabaseRequest("users", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ external_id: incoming.from, phone_number: incoming.from, platform: "whatsapp", display_name: incoming.name || null, updated_at: new Date().toISOString() }) });
  } catch (error) { console.error("Meta user save failed:", error.message); }
}

async function loadContext(from, userText) {
  const local = conversations.get(from) || [];
  let history = local.slice(-10);
  if (SUPABASE_URL && SUPABASE_KEY) {
    try {
      const rows = await supabaseRequest(`chat_history?external_user_id=eq.${encodeURIComponent(from)}&order=created_at.desc&limit=10`);
      history = (rows || []).reverse().map((row) => ({ role: row.sender === "user" ? "user" : "assistant", content: row.message }));
    } catch (error) { console.error("Context load failed:", error.message); }
  }
  return { history, knowledge: `${liveKnowledge}\n\nسؤال العميل الحالي: ${userText}` };
}

async function saveChat(from, sender, message, platform = "whatsapp") {
  const local = conversations.get(from) || [];
  local.push({ role: sender === "user" ? "user" : "assistant", content: message });
  conversations.set(from, local.slice(-20));
  if (SUPABASE_URL && SUPABASE_KEY) {
    try { await supabaseRequest("chat_history", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ external_user_id: from, phone_number: from, platform, sender, message }) }); }
    catch (error) { console.error("Chat save failed:", error.message); }
  }
}

async function loadPersistentTraining() {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;
  try {
    const rows = await supabaseRequest("bot_settings?key=in.(system_instructions,knowledge_base)&select=key,value_json");
    for (const row of rows || []) {
      if (row.key === "system_instructions" && typeof row.value_json?.text === "string") liveBotInstructions = row.value_json.text;
      if (row.key === "knowledge_base" && typeof row.value_json?.text === "string") liveKnowledge = row.value_json.text;
    }
  } catch (error) { console.error("Training load failed:", error.message); }
}

async function savePersistentTraining(instructions, knowledgeText) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;
  const now = new Date().toISOString();
  for (const row of [
    { key: "system_instructions", value_json: { text: instructions }, updated_by: "admin", updated_at: now },
    { key: "knowledge_base", value_json: { text: knowledgeText }, updated_by: "admin", updated_at: now },
  ]) {
    await supabaseRequest("bot_settings", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(row) });
  }
  await supabaseRequest("training_revisions", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ instructions, knowledge: knowledgeText, changed_by: "admin" }) });
}

async function saveKnowledgeCandidate(question, answer, source = "openai") {
  if (!SUPABASE_URL || !SUPABASE_KEY || !question || !answer) return;
  try {
    await supabaseRequest("extracted_facts", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ fact: `سؤال العميل: ${String(question).slice(0, 2000)}\nإجابة النموذج: ${String(answer).slice(0, 6000)}`, source, confidence: 0.5, approved: false }),
    });
  } catch (error) { console.error("Knowledge candidate save failed:", error.message); }
}

async function askOpenAI(userText, context) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST", headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: AI_MODEL, temperature: 0.2, max_tokens: 500, messages: [{ role: "system", content: `${liveBotInstructions}\n\nقاعدة المعرفة:\n${context.knowledge}` }, ...context.history, { role: "user", content: userText }] }),
  });
  if (!response.ok) throw new Error(`OpenAI ${response.status}: ${await response.text()}`);
  return (await response.json()).choices?.[0]?.message?.content?.trim();
}

async function askGemini(userText, context) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: `${liveBotInstructions}\n\nقاعدة المعرفة:\n${context.knowledge}` }] }, contents: [...context.history.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })), { role: "user", parts: [{ text: userText }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 500 } }),
  });
  if (!response.ok) throw new Error(`Gemini ${response.status}: ${await response.text()}`);
  return (await response.json()).candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
}

async function askAI(userText, context) {
  if (AI_PROVIDER === "gemini") return askGemini(userText, context);
  return askOpenAI(userText, context);
}

async function sendWhatsAppText(to, text) {
  const response = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${PHONE_NUMBER_ID}/messages`, {
    method: "POST", headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { preview_url: false, body: String(text).slice(0, 4096) } }),
  });
  if (!response.ok) throw new Error(`WhatsApp ${response.status}: ${await response.text()}`);
  return response.json();
}

async function processIncoming(incoming) {
  if (processedMessageIds.has(incoming.messageId)) return;
  processedMessageIds.set(incoming.messageId, Date.now());
  setTimeout(() => processedMessageIds.delete(incoming.messageId), 24 * 60 * 60 * 1000);
  await saveChat(incoming.from, "user", incoming.text);
  const isAdmin = ADMIN_WHATSAPP_NUMBERS.has(String(incoming.from).replace(/\D/g, ""));
  const command = incoming.text.toLowerCase();
  if (isAdmin && (command === "/تدريب" || command === "تدريب")) {
    whatsappTrainingMode.add(incoming.from);
    return sendWhatsAppText(incoming.from, "تم تفعيل وضع التدريب. ناقشني أو أرسل معلومة، وسأحفظ نتائج النقاش كاقتراحات مراجعة. لإيقافه أرسل: /إيقاف التدريب");
  }
  if (isAdmin && (command === "/إيقاف التدريب" || command === "إيقاف التدريب")) {
    whatsappTrainingMode.delete(incoming.from);
    return sendWhatsAppText(incoming.from, "تم إيقاف وضع التدريب. ستستمر المحادثة العادية دون إضافة اقتراحات تدريبية.");
  }
  if (isAdmin && (command === "/حالة البوت" || command === "حالة البوت")) {
    const services = configStatus();
    return sendWhatsAppText(incoming.from, `حالة البوت: WhatsApp=${services.whatsapp ? "متصل" : "غير مهيأ"}، AI=${services.ai ? "متصل" : "غير مهيأ"}، Supabase=${services.supabase ? "متصل" : "غير مهيأ"}، التدريب=${whatsappTrainingMode.has(incoming.from) ? "مفعل" : "متوقف"}`);
  }
  const context = await loadContext(incoming.from, incoming.text);
  const answer = await askAI(incoming.text, context);
  if (!answer) throw new Error("AI returned an empty response");
  await saveChat(incoming.from, "assistant", answer);
  if (isAdmin && whatsappTrainingMode.has(incoming.from)) await saveKnowledgeCandidate(incoming.text, answer, `whatsapp-${AI_PROVIDER}-training`);
  await sendWhatsAppText(incoming.from, answer);
}

function verifyWebhook(req, res) {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && VERIFY_TOKEN && token === VERIFY_TOKEN) return res.status(200).send(String(challenge));
  return res.sendStatus(403);
}

function requireAdmin(req, res, next) {
  const token = req.get("x-admin-session");
  if (token && adminSessions.has(token)) return next();
  return res.status(401).json({ error: "Unauthorized" });
}

function createAdminSession() {
  const token = crypto.createHmac("sha256", ADMIN_SESSION_SECRET).update(`${Date.now()}:${crypto.randomBytes(16).toString("hex")}`).digest("hex");
  adminSessions.set(token, Date.now());
  setTimeout(() => adminSessions.delete(token), 12 * 60 * 60 * 1000);
  return token;
}

const adminPage = `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>مدرب بوت أصيل</title><style>body{font-family:system-ui;background:#0f172a;color:#f8fafc;max-width:900px;margin:auto;padding:20px}section{background:#1e293b;border-radius:14px;padding:18px;margin:14px 0}input,textarea,button{width:100%;box-sizing:border-box;padding:12px;margin-top:8px;border-radius:9px;border:1px solid #475569;background:#0f172a;color:#fff;font:inherit}textarea{min-height:150px}button{background:#2563eb;border:0;cursor:pointer}.chat{height:260px;overflow:auto;background:#020617;padding:12px;border-radius:9px;white-space:pre-wrap}.msg{padding:8px;border-bottom:1px solid #1e293b}.error{color:#fecaca}</style><h1>مدرب بوت أصيل</h1><p>لوحة خاصة وآمنة لتدريب البوت واختباره مباشرة. لا تشارك كلمة المرور.</p><section id="login"><h2>دخول المدير</h2><input id="password" type="password" placeholder="كلمة المرور"><button onclick="login()">دخول</button><p id="loginMsg"></p></section><main id="panel" hidden><section><h2>محادثة تدريب مباشرة</h2><div id="chat" class="chat"></div><input id="question" placeholder="اكتب سؤالًا لاختبار البوت"><button onclick="ask()">إرسال</button></section><section><h2>تعليمات البوت</h2><textarea id="instructions"></textarea><h2>قاعدة المعرفة</h2><textarea id="knowledge"></textarea><button onclick="saveConfig()">حفظ التدريب</button><p id="saveMsg"></p></section></main><script>let session='';async function call(url,opt={}){const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),30000);try{opt.signal=controller.signal;opt.headers={...(opt.headers||{}),'x-admin-session':session,'Content-Type':'application/json'};const r=await fetch(url,opt);let d={};try{d=await r.json()}catch{}if(!r.ok)throw Error(d.error||'فشل الطلب');return d}finally{clearTimeout(timer)}}function add(role,text,error=false){const row=document.createElement('div');row.className=error?'msg error':'msg';const label=document.createElement('b');label.textContent=role+': ';row.append(label,document.createTextNode(text));chat.appendChild(row)}async function login(){try{const d=await call('/admin/login',{method:'POST',body:JSON.stringify({password:document.getElementById('password').value})});session=d.session;login.hidden=true;panel.hidden=false;const c=await call('/admin/config');instructions.value=c.instructions;knowledge.value=c.knowledge}catch(e){loginMsg.textContent=e.name==='AbortError'?'انتهت مهلة الاتصال':'فشل الدخول: '+e.message}}async function ask(){const q=question.value.trim();if(!q)return;add('أنت',q);question.value='';try{const d=await call('/admin/test-chat',{method:'POST',body:JSON.stringify({message:q})});add('البوت',d.answer||'وصل رد فارغ');}catch(e){add('النظام',e.name==='AbortError'?'انتهت مهلة رد الذكاء الاصطناعي':'تعذر الرد: '+e.message,true)}chat.scrollTop=chat.scrollHeight}async function saveConfig(){try{const d=await call('/admin/config',{method:'PUT',body:JSON.stringify({instructions:instructions.value,knowledge:knowledge.value})});saveMsg.textContent=d.ok?'تم الحفظ':'تعذر الحفظ'}catch(e){saveMsg.textContent='تعذر الحفظ: '+e.message}}</script>`;

function receiveWebhook(req, res) {
  if (!verifyMetaSignature(req)) return res.sendStatus(403);
  res.sendStatus(200);
  void saveMetaEvent(req.body);
  for (const incoming of extractIncomingMessages(req.body)) {
    void saveMetaUser(incoming);
    processIncoming(incoming).catch(async (error) => {
      console.error("Message processing failed:", error.message);
      void saveMetaEvent(req.body, "failed", error.message);
      try { await sendWhatsAppText(incoming.from, "شكرًا لتواصلك. تعذر الرد آليًا الآن، وسيتابع فريق خدمة العملاء استفسارك قريبًا."); } catch (fallbackError) { console.error("Fallback failed:", fallbackError.message); }
    });
  }
}

app.get("/", (_req, res) => res.json({ ok: true, service: "Aseel WhatsApp Smart Bot", webhook: "/webhook" }));
app.get("/health", (_req, res) => {
  const services = configStatus();
  res.json({ ok: true, configured: services.whatsapp && services.ai, services });
});
app.get("/webhook", verifyWebhook);
app.post("/webhook", receiveWebhook);
app.get("/api/webhook/meta", verifyWebhook);
app.post("/api/webhook/meta", receiveWebhook);
app.get("/admin", (_req, res) => res.type("html").send(adminPage));
app.post("/admin/login", (req, res) => {
  const source = req.ip || "unknown";
  const attempt = loginAttempts.get(source) || { count: 0, resetAt: Date.now() + 15 * 60 * 1000 };
  if (Date.now() > attempt.resetAt) { attempt.count = 0; attempt.resetAt = Date.now() + 15 * 60 * 1000; }
  if (attempt.count >= 8) return res.status(429).json({ error: "تم إيقاف محاولات الدخول مؤقتًا" });
  attempt.count += 1;
  loginAttempts.set(source, attempt);
  if (!ADMIN_PASSWORD || !req.body?.password || req.body.password !== ADMIN_PASSWORD) return res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
  loginAttempts.delete(source);
  return res.json({ ok: true, session: createAdminSession() });
});
app.get("/admin/config", requireAdmin, (_req, res) => res.json({ instructions: liveBotInstructions, knowledge: liveKnowledge }));
app.put("/admin/config", requireAdmin, async (req, res) => {
  if (typeof req.body?.instructions === "string" && req.body.instructions.trim()) liveBotInstructions = req.body.instructions.trim();
  if (typeof req.body?.knowledge === "string" && req.body.knowledge.trim()) liveKnowledge = req.body.knowledge.trim();
  try { await savePersistentTraining(liveBotInstructions, liveKnowledge); }
  catch (error) { console.error("Training save failed:", error.message); return res.status(500).json({ error: "تعذر الحفظ الدائم" }); }
  return res.json({ ok: true });
});
app.post("/admin/command", requireAdmin, async (req, res) => {
  const command = String(req.body?.command || "").trim().toLowerCase();
  if (command === "status" || command === "حالة") return res.json({ ok: true, status: configStatus(), provider: AI_PROVIDER, model: AI_PROVIDER === "gemini" ? GEMINI_MODEL : AI_MODEL });
  if (command === "reload" || command === "إعادة تحميل") { await loadPersistentTraining(); return res.json({ ok: true, message: "تم تحميل التدريب المحفوظ" }); }
  return res.status(400).json({ error: "الأمر غير مسموح. الأوامر المتاحة: status, reload" });
});
app.post("/admin/test-chat", requireAdmin, async (req, res) => {
  try {
    const message = String(req.body?.message || "").trim();
    if (!message) return res.status(400).json({ error: "message is required" });
    const answer = await askAI(message, await loadContext("admin-training", message));
    await saveChat("admin-training", "user", message, "admin");
    await saveChat("admin-training", "assistant", answer, "admin");
    await saveKnowledgeCandidate(message, answer, AI_PROVIDER);
    return res.json({ ok: true, answer });
  } catch (error) { console.error("Admin test chat failed:", error.message); return res.status(500).json({ error: "تعذر تشغيل الاختبار" }); }
});
app.post("/api/custom-chat", async (req, res) => {
  try {
    const text = String(req.body?.message || "").trim();
    if (!text) return res.status(400).json({ error: "message is required" });
    const session = String(req.body?.session_id || "custom-web");
    const context = await loadContext(session, text);
    const answer = await askAI(text, context);
    await saveChat(session, "user", text, "custom");
    await saveChat(session, "assistant", answer, "custom");
    return res.json({ ok: true, answer });
  } catch (error) { console.error("Custom chat failed:", error.message); return res.status(500).json({ error: "Unable to process request" }); }
});

app.use((error, _req, res, _next) => { console.error("Unhandled request error:", error.message); res.status(500).json({ error: "Internal server error" }); });

if (require.main === module) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Bot listening on port ${PORT}`);
    void loadPersistentTraining();
  });
}
module.exports = app;
