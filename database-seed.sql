-- Seed data for Aseel personal AI agent
-- Run after supabase-schema.sql

insert into public.bot_settings (key, value_json, updated_by)
values
  ('system_instructions', '{"text":"أنت مساعد خدمة عملاء يمثل أصيل محمد عبدالله مساعد الجعوري. أجب بالعربية بأسلوب مهني مختصر. اعتمد على قاعدة المعرفة المعتمدة فقط، ولا تخترع أسعارًا أو مواعيد أو ضمانات. عند طلب سعر أو حجز، اجمع الاسم والخدمة والمدينة والوقت المناسب واذكر أن الفريق سيؤكد التفاصيل. لا تطلب كلمات مرور أو رموز وصول أو أرقام بطاقات. عند عدم المعرفة أو طلب موظف، حوّل العميل إلى فريق الخدمة."}'::jsonb, 'seed'),
  ('knowledge_base', '{"text":"أصيل محمد عبدالله مساعد الجعوري يقدم حلول تقنية وإدارية تشمل نشر واستضافة المواقع، Netlify وSupabase، الأتمتة والتكاملات، أنظمة ERP والأنظمة المالية Onyx وZoho وOdoo، الشبكات وكاميرات المراقبة، نقاط البيع POS للمطاعم، إدارة المخزون والتكاليف، الخدمات الإلكترونية، الفوترة الإلكترونية ZATCA، منصة قوى، التسويق الرقمي، إدارة الجودة، وتطوير الأعمال. الموقع: https://cool-narwhal-7ce84a.netlify.app. واتساب: +966504624380. البريد: aljaowrryasealmohamad@gmail.com."}'::jsonb, 'seed')
on conflict (key) do update set value_json = excluded.value_json, updated_by = excluded.updated_by, updated_at = now();

insert into public.bot_commands (command, instruction, updated_by)
values
  ('/الخدمات', 'اعرض خدمات أصيل في قائمة عربية مختصرة ثم اسأل العميل عن الخدمة التي يحتاجها.', 'seed'),
  ('/موظف', 'أبلغ العميل أن طلبه سيحوّل إلى فريق خدمة العملاء، ولا تطلب بيانات حساسة.', 'seed'),
  ('/حجز', 'اجمع اسم العميل والخدمة والمدينة والوقت المناسب، ثم اذكر أن الفريق سيؤكد الموعد.', 'seed'),
  ('/الموقع', 'أرسل رابط الموقع الرسمي: https://cool-narwhal-7ce84a.netlify.app', 'seed'),
  ('/التواصل', 'اعرض واتساب +966504624380 والبريد aljaowrryasealmohamad@gmail.com.', 'seed')
on conflict (command) do update set instruction = excluded.instruction, enabled = true, updated_by = excluded.updated_by, updated_at = now();

insert into public.knowledge_base (title, content, source, approved, created_by)
values
  ('نبذة عن أصيل', 'أصيل محمد عبدالله مساعد الجعوري خبير في تقنية المعلومات والإدارة الرقمية.', 'seed', true, 'seed'),
  ('الخدمات التقنية', 'نشر واستضافة المواقع، Netlify، Supabase، الأتمتة، التكاملات، الذكاء الاصطناعي، والشبكات.', 'seed', true, 'seed'),
  ('الأنظمة المالية ERP', 'خبرة في Onyx وZoho وOdoo وأنظمة ERP المحاسبية وإدارة العمليات.', 'seed', true, 'seed'),
  ('المطاعم والتجزئة', 'حلول نقاط البيع POS، إدارة المخزون، حساب تكلفة الوصفات، وربط الأنظمة.', 'seed', true, 'seed'),
  ('الخدمات السعودية', 'دعم تشغيلي عام لمنصة قوى والفوترة الإلكترونية ZATCA، دون تقديم ضمان قانوني أو ضريبي نهائي.', 'seed', true, 'seed'),
  ('بيانات التواصل', 'الموقع https://cool-narwhal-7ce84a.netlify.app، واتساب +966504624380، البريد aljaowrryasealmohamad@gmail.com.', 'seed', true, 'seed')
;
