# Da3wa Admin V2
1. نفّذ supabase-schema.sql في Supabase SQL Editor.
2. افتح admin.html وأنشئ حساب المدير أو سجّل الدخول.
3. عدّل البيانات واضغط حفظ التعديلات.
4. index.html يقرأ البيانات العامة من Supabase تلقائيًا.

أمنيًا: لا تضع secret/service-role key في الواجهة. المفتاح المستخدم هنا publishable فقط. بما أن الـSecret key تم كشفه في المحادثة، يجب تدويره/إلغاؤه من Supabase وعدم وضعه في GitHub.
