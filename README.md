# Aseel WhatsApp Smart Bot

خادم Node.js/Express لبوت WhatsApp Cloud API مع OpenAI أو Gemini، وذاكرة محادثة اختيارية عبر Supabase.

## المسارات

- `GET /` فحص الخدمة.
- `GET /health` فحص إعدادات WhatsApp والذكاء الاصطناعي وSupabase.
- `GET /webhook` و`GET /api/webhook/meta` تحقق Meta.
- `POST /webhook` و`POST /api/webhook/meta` استقبال أحداث Meta.
- `POST /api/custom-chat` استقبال `{ "message": "...", "session_id": "..." }`.
- `/admin` لوحة تدريب محمية بكلمة مرور، مع محادثة اختبار وتعديل التعليمات وقاعدة المعرفة.

## إصلاح ربط Meta

استخدم في Meta:

```text
Callback URL: https://YOUR-SERVICE.onrender.com/webhook
Verify Token: نفس قيمة VERIFY_TOKEN في Render حرفيًا
```

يمكن استخدام المسار الجديد بدلًا من ذلك:

```text
https://YOUR-SERVICE.onrender.com/api/webhook/meta
```

لكن لا تخلط بين المسارين. ابدأ بـ `/webhook` لأنه متوافق مع الإعداد السابق.

اختبار التحقق:

```bash
curl "https://YOUR-SERVICE.onrender.com/webhook?hub.mode=subscribe&hub.verify_token=YOUR_VERIFY_TOKEN&hub.challenge=12345"
```

النتيجة الصحيحة هي `12345`.

## متغيرات Render

أضف القيم السرية من `.env.example` في Render Environment. يجب أن تكون `WHATSAPP_TOKEN` و`VERIFY_TOKEN` و`PHONE_NUMBER_ID` موجودة. اختر مزودًا واحدًا على الأقل: `AI_PROVIDER=gemini` مع `GEMINI_API_KEY` أو `AI_PROVIDER=openai` مع `OPENAI_API_KEY`. بعد الحفظ نفّذ Deploy/Restart.

لا تضع الرموز داخل Git أو كود الواجهة. إذا كانت قيمة رمز التحقق ظهرت في لقطة شاشة، غيّرها.

## لوحة التدريب الحية

أضف في Render:

```text
ADMIN_PASSWORD=كلمة مرور قوية طويلة
ADMIN_SESSION_SECRET=قيمة عشوائية طويلة
```

بعد النشر افتح:

```text
https://YOUR-SERVICE.onrender.com/admin
```

تسمح اللوحة بتعديل تعليمات البوت وقاعدة المعرفة واختبار الرد مباشرة. عند تفعيل Supabase تُحفظ التغييرات في `bot_settings` وتُسجل إصداراتها في `training_revisions`، وتُستعاد عند تشغيل الخدمة. بدون Supabase تكون التغييرات مؤقتة. لا يغيّر البوت نفسه أو صلاحياته تلقائيًا؛ تُحفظ اقتراحات التطوير غير المعتمدة للمراجعة قبل اعتمادها.

## Supabase

نفّذ `supabase-schema.sql` في SQL Editor، ثم أضف `SUPABASE_URL` و`SUPABASE_SERVICE_ROLE_KEY` في Render. قاعدة البيانات اختيارية للرد الأساسي، لكنها مطلوبة للذاكرة الدائمة. المفتاح Service Role لا يُكشف للمتصفح.

النسخة الحالية تحفظ آخر المحادثات محليًا وتستخدمها في السياق. عند تفعيل Supabase تحفظ السجل الدائم. يمكن إضافة Embeddings واستدعاء `match_knowledge` لاحقًا بعد إدخال متجهات المعرفة؛ لا يتم اعتماد حقائق مستخرجة آليًا إلا بعد مراجعتها (`approved=false` افتراضيًا).

## النشر على Render

اجعل Build Command:

```bash
npm install
```

واجعل Start Command:

```bash
npm start
```

أو استخدم `node index.js`. يجب أن يستمع الخادم إلى `process.env.PORT`.
