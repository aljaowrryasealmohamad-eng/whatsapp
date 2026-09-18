# النسخة النهائية النظيفة

هذه النسخة هي مشروع واحد فقط. لا تخلط ملفاتها مع النسخ القديمة.

## محتويات الجذر

- `index.js`: خادم Express، WhatsApp Webhook، OpenAI، لوحة الإدارة.
- `package.json` و`package-lock.json`: الاعتماديات والتشغيل.
- `render.yaml`: إعدادات Render.
- `supabase-schema.sql`: إنشاء قاعدة البيانات.
- `database-seed.sql`: البيانات الأولية والخدمات والأوامر.
- `knowledge-source-ar.md`: مصدر المعرفة العربي.
- `.env.example`: أسماء المتغيرات دون أسرار.
- ملفات التوثيق والدفاع.

## رفع GitHub وRender

احذف محتويات المستودع القديمة، ثم ارفع الملفات الموجودة في جذر هذه الحزمة مباشرة. لا ترفع ملف ZIP داخل المستودع، ولا ترفع `node_modules`، ولا ترفع ملف `.env`.

يجب أن تكون ملفات التشغيل في جذر المستودع:

```text
index.js
package.json
package-lock.json
```

في Render استخدم:

```text
Build Command: npm ci
Start Command: npm start
Health Check Path: /health
```

## متغيرات Render

ضع القيم السرية في Render Environment فقط:

```text
AI_PROVIDER=gemini
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.5-flash
```

أو استخدم OpenAI بدلًا من Gemini:

```text
AI_PROVIDER=openai
OPENAI_API_KEY=...
AI_MODEL=gpt-4o-mini
WHATSAPP_TOKEN=...
PHONE_NUMBER_ID=...
VERIFY_TOKEN=...
META_APP_SECRET=...
ADMIN_PASSWORD=...
ADMIN_SESSION_SECRET=...
ADMIN_WHATSAPP_NUMBERS=9665XXXXXXXX
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

لا تستخدم قيمة `OPENAI_API_KEY` أو `WHATSAPP_TOKEN` في GitHub أو داخل SQL.

## Supabase

نفّذ `supabase-schema.sql` مرة واحدة في Supabase SQL Editor، ثم نفّذ `database-seed.sql`. رفع ملفات SQL إلى GitHub لا ينفذها تلقائيًا.

## المسارات

```text
GET  /health
GET  /admin
POST /admin/login
POST /admin/test-chat
GET  /webhook
POST /webhook
GET  /api/webhook/meta
POST /api/webhook/meta
```

## تعلم البوت

يُحفظ الحوار في `chat_history`، وتُحفظ إجابات النموذج كاقتراحات في `extracted_facts` بحالة `approved=false`. لا تدخل الإجابة إلى المعرفة المعتمدة إلا بعد مراجعتها من المدير.

## التدريب والنقاش من WhatsApp

ضع أرقام المدير المسموح لها بالتدريب في `ADMIN_WHATSAPP_NUMBERS` مفصولة بفواصل، من دون علامة `+`، مثل:

```text
ADMIN_WHATSAPP_NUMBERS=966501234567,966512345678
```

من الرقم الإداري أرسل:

```text
/تدريب
```

ثم ناقش النموذج أو أرسل معلومات تريد مراجعتها. تُحفظ نتائج التدريب كاقتراحات في `extracted_facts` ولا تُعتمد تلقائيًا.

لإيقاف التدريب:

```text
/إيقاف التدريب
```

لعرض الحالة:

```text
/حالة البوت
```

العملاء العاديون يستطيعون طرح الأسئلة والحصول على الردود، لكن لا يمكنهم تفعيل وضع التدريب أو إضافة اقتراحات معرفة.
