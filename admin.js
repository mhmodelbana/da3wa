const client = window.supabaseClient;

let DEFAULTS = null;
let session = null;
let currentInvitation = null;
let state = null;

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

function merge(a, b) {
  if (Array.isArray(a)) return Array.isArray(b) ? b : a;
  if (a && typeof a === 'object') {
    const out = { ...a };
    if (b && typeof b === 'object') {
      for (const [k, v] of Object.entries(b)) out[k] = merge(a[k], v);
    }
    return out;
  }
  return b === undefined ? a : b;
}

function cloneDefaults() {
  return structuredClone(DEFAULTS);
}

function get(obj, path) {
  return path.split('.').reduce((a, k) => a?.[k], obj);
}

function set(obj, path, value) {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!cur[parts[i]] || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts.at(-1)] = value;
}

function esc(v) {
  return String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function toast(message, kind = '') {
  const el = $('#status');
  el.textContent = message;
  el.className = `status show ${kind}`;
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => { el.className = 'status'; }, 3200);
}

function normalizeSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\u0600-\u06ff_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function publicUrl(slug) {
  const clean = encodeURIComponent(slug);
  const base = new URL('./', location.href).href;
  return `${base}${clean}`;
}

async function loadDefaults() {
  const r = await fetch('./default-invitation.json', { cache: 'no-store' });
  if (!r.ok) throw new Error('تعذر تحميل البيانات الافتراضية');
  DEFAULTS = await r.json();
}

async function listInvitations() {
  const { data, error } = await client
    .from('wedding_invitations')
    .select('id,slug,title,published,updated_at,data')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

function statusBadge(item) {
  return item.published
    ? '<span class="badge badge-live">منشورة</span>'
    : '<span class="badge badge-draft">مسودة</span>';
}

function renderInvitationList(items) {
  const box = $('#invitationList');
  if (!items.length) {
    box.innerHTML = `<div class="empty"><div class="empty-icon">💌</div><strong>لا توجد دعوات حتى الآن</strong><p>أنشئ أول دعوة من القالب الحالي.</p><button class="btn btn-primary" id="emptyCreateBtn">+ إنشاء دعوة</button></div>`;
    $('#emptyCreateBtn').onclick = () => openCreate();
    return;
  }

  box.innerHTML = items.map(item => `
    <article class="invite-row">
      <div class="invite-main">
        <div class="invite-mark">💍</div>
        <div>
          <div class="invite-title">${esc(item.title || item.slug)} ${statusBadge(item)}</div>
          <div class="invite-slug">/${esc(item.slug)}</div>
          <div class="invite-date">آخر تعديل: ${new Date(item.updated_at).toLocaleString('ar-EG')}</div>
        </div>
      </div>
      <div class="invite-actions">
        <button class="btn btn-small" data-action="edit" data-id="${item.id}">تعديل</button>
        <a class="btn btn-small" href="${publicUrl(item.slug)}" target="_blank" rel="noopener">معاينة ↗</a>
        <button class="btn btn-small" data-action="duplicate" data-id="${item.id}">نسخ</button>
        <button class="btn btn-small btn-danger" data-action="delete" data-id="${item.id}">حذف</button>
      </div>
    </article>
  `).join('');

  box.querySelectorAll('[data-action]').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.id;
      try {
        if (btn.dataset.action === 'edit') await openEdit(id);
        if (btn.dataset.action === 'duplicate') await duplicateInvitation(id);
        if (btn.dataset.action === 'delete') await deleteInvitation(id);
      } catch (e) {
        console.error(e);
        toast(e.message || 'حدث خطأ غير متوقع', 'bad');
      }
    };
  });
}

function populateForm() {
  $$('[data-bind]').forEach(el => {
    el.value = get(state, el.dataset.bind) ?? '';
    el.oninput = () => set(state, el.dataset.bind, el.value);
  });

  $$('[data-bind-bool]').forEach(el => {
    el.checked = Boolean(get(state, el.dataset.bindBool));
    el.onchange = () => set(state, el.dataset.bindBool, el.checked);
  });

  $('#invitationTitle').value = currentInvitation.title || state.meta?.title || 'دعوة زفاف';
  $('#invitationSlug').value = currentInvitation.slug || '';
  $('#published').checked = currentInvitation.published !== false;

  renderMembers('groom');
  renderMembers('bride');
  renderEvents();
}

function renderMembers(side) {
  const box = $(`#${side}Members`);
  const members = get(state, `families.${side}.members`) || [];
  box.innerHTML = members.map((value, i) => `
    <div class="member-row">
      <input value="${esc(value)}" data-member-index="${i}" />
      <button class="btn btn-danger btn-small" type="button" data-remove-member="${i}">حذف</button>
    </div>
  `).join('');
  box.querySelectorAll('[data-member-index]').forEach(input => {
    input.oninput = () => { state.families[side].members[Number(input.dataset.memberIndex)] = input.value; };
  });
  box.querySelectorAll('[data-remove-member]').forEach(btn => {
    btn.onclick = () => { state.families[side].members.splice(Number(btn.dataset.removeMember), 1); renderMembers(side); };
  });
}

function field(label, key, value, full = false, area = false) {
  return `<div class="field ${full ? 'full' : ''}"><label>${label}</label>${area ? `<textarea data-k="${key}">${esc(value)}</textarea>` : `<input data-k="${key}" value="${esc(value)}">`}</div>`;
}

function renderEvents() {
  const root = $('#eventsEditor');
  root.innerHTML = '';
  const events = state.events || [];
  for (let i = 0; i < Math.min(3, events.length); i++) {
    const ev = events[i];
    const card = document.createElement('div');
    card.className = 'panel event-card';
    card.innerHTML = `
      <div class="panel-head"><div><h2>المناسبة ${i + 1}</h2><p class="hint">الصفحة الحالية تعرض 3 مناسبات رئيسية.</p></div></div>
      <div class="grid">
        ${field('العنوان','title',ev.title)}
        ${field('التاريخ الظاهر','dateLabel',ev.dateLabel)}
        ${field('المكان','location',ev.location,'full')}
        ${field('الوصف','description',ev.description,'full',true)}
        ${field('بحث Google Maps','mapQuery',ev.mapQuery,'full')}
        ${field('رابط Google Maps اختياري','mapsUrl',ev.mapsUrl,'full')}
        ${field('بداية ISO','startISO',ev.startISO)}
        ${field('نهاية ISO','endISO',ev.endISO)}
        ${field('عنوان التقويم','calendarTitle',ev.calendarTitle)}
      </div>
    `;
    card.querySelectorAll('[data-k]').forEach(el => {
      el.oninput = () => { state.events[i][el.dataset.k] = el.value; };
    });
    root.append(card);
  }
}

function showEditor(show) {
  $('#dashboardView').classList.toggle('hidden', show);
  $('#editorView').classList.toggle('hidden', !show);
  window.scrollTo({ top: 0, behavior: 'auto' });
}

function resetEditor() {
  currentInvitation = { id: null, slug: '', title: '', published: true };
  state = cloneDefaults();
  showEditor(true);
  populateForm();
}

async function openCreate() {
  if (!DEFAULTS) await loadDefaults();
  resetEditor();
  $('#editorHeading').textContent = 'إنشاء دعوة جديدة';
  $('#editorMode').textContent = 'ستُحفظ نسخة مستقلة يمكن تعديلها لاحقًا.';
  $('#invitationSlug').focus();
}

async function openEdit(id) {
  const { data, error } = await client.from('wedding_invitations').select('*').eq('id', id).single();
  if (error) throw error;
  currentInvitation = data;
  state = merge(cloneDefaults(), data.data || {});
  showEditor(true);
  $('#editorHeading').textContent = 'تعديل الدعوة';
  $('#editorMode').textContent = `الرابط: /${data.slug}`;
  populateForm();
}

async function saveInvitation() {
  if (!session?.user?.id) return toast('سجّل الدخول أولًا', 'bad');

  const slug = normalizeSlug($('#invitationSlug').value);
  const title = $('#invitationTitle').value.trim() || state.meta?.title || 'دعوة زفاف';
  const published = $('#published').checked;

  if (!slug || slug.length < 2) return toast('اكتب رابطًا مختصرًا صالحًا مثل ammar-fatma', 'bad');
  if (!/^[a-z0-9\u0600-\u06ff_-]+$/.test(slug)) return toast('الرابط يحتوي على رموز غير مسموحة', 'bad');

  state.meta.title = title;
  state.meta.displayUrl = slug;

  const payload = { owner_id: session.user.id, slug, title, published, data: state };
  let result;
  if (currentInvitation.id) {
    result = await client.from('wedding_invitations').update({ slug, title, published, data: state }).eq('id', currentInvitation.id).select().single();
  } else {
    result = await client.from('wedding_invitations').insert(payload).select().single();
  }
  if (result.error) {
    console.error(result.error);
    if (result.error.code === '23505') return toast('هذا الرابط مستخدم بالفعل. اختر Slug آخر.', 'bad');
    return toast(result.error.message, 'bad');
  }
  currentInvitation = result.data;
  toast('تم حفظ الدعوة بنجاح ❤️', 'ok');
  $('#editorMode').textContent = `الرابط: /${result.data.slug}`;
  await refreshList();
}

async function duplicateInvitation(id) {
  const { data, error } = await client.from('wedding_invitations').select('*').eq('id', id).single();
  if (error) throw error;
  const base = normalizeSlug(`${data.slug}-copy`);
  let slug = base;
  let n = 2;
  while (true) {
    const check = await client.from('wedding_invitations').select('id').eq('slug', slug).maybeSingle();
    if (!check.data) break;
    slug = `${base}-${n++}`;
  }
  const r = await client.from('wedding_invitations').insert({ owner_id: session.user.id, slug, title: `${data.title} - نسخة`, published: false, data: data.data }).select().single();
  if (r.error) throw r.error;
  toast(`تم إنشاء نسخة: /${slug}`, 'ok');
  await refreshList();
  await openEdit(r.data.id);
}

async function deleteInvitation(id) {
  const item = (await listInvitations()).find(x => x.id === id);
  if (!item) return;
  if (!confirm(`حذف الدعوة /${item.slug} نهائيًا؟`)) return;
  const r = await client.from('wedding_invitations').delete().eq('id', id);
  if (r.error) throw r.error;
  if (currentInvitation?.id === id) showEditor(false);
  toast('تم حذف الدعوة', 'ok');
  await refreshList();
}

async function refreshList() {
  const items = await listInvitations();
  renderInvitationList(items);
  $('#invitationCount').textContent = items.length;
  return items;
}

async function boot() {
  if (!client) return toast('تعذر إنشاء اتصال Supabase', 'bad');
  await loadDefaults();
  const r = await client.auth.getSession();
  session = r.data.session;
  if (session) {
    $('#loginView').classList.add('hidden');
    $('#appView').classList.remove('hidden');
    $('#userLabel').textContent = session.user.email || '';
    await refreshList();
  }
}

$('#loginBtn').onclick = async () => {
  const email = $('#email').value.trim();
  const password = $('#password').value;
  if (!email || !password) return toast('أدخل البريد وكلمة المرور', 'bad');
  const r = await client.auth.signInWithPassword({ email, password });
  if (r.error) return toast(r.error.message, 'bad');
  session = r.data.session;
  $('#loginView').classList.add('hidden');
  $('#appView').classList.remove('hidden');
  $('#userLabel').textContent = session.user.email || '';
  await refreshList();
};

$('#signupBtn').onclick = async () => {
  const email = $('#email').value.trim();
  const password = $('#password').value;
  if (!email || password.length < 6) return toast('أدخل بريدًا وكلمة مرور 6 أحرف على الأقل', 'bad');
  const r = await client.auth.signUp({ email, password });
  if (r.error) return toast(r.error.message, 'bad');
  toast(r.data.session ? 'تم إنشاء الحساب' : 'تم إنشاء الحساب. أكّد البريد الإلكتروني ثم سجّل الدخول.', 'ok');
};

$('#newInvitationBtn').onclick = openCreate;
$('#backToListBtn').onclick = () => showEditor(false);
$('#saveInvitationBtn').onclick = saveInvitation;
$('#copyUrlBtn').onclick = async () => {
  const slug = normalizeSlug($('#invitationSlug').value);
  if (!slug) return toast('احفظ الدعوة أولًا', 'bad');
  try {
    await navigator.clipboard.writeText(publicUrl(slug));
    toast('تم نسخ رابط الدعوة ❤️', 'ok');
  } catch { toast(publicUrl(slug)); }
};
$('#previewBtn').onclick = () => {
  const slug = normalizeSlug($('#invitationSlug').value);
  if (slug) window.open(publicUrl(slug), '_blank', 'noopener');
};
$('#logoutBtn').onclick = async () => { await client.auth.signOut(); location.reload(); };
$('#addGroomMember').onclick = () => { state.families.groom.members.push(''); renderMembers('groom'); };
$('#addBrideMember').onclick = () => { state.families.bride.members.push(''); renderMembers('bride'); };
$('#addEventBtn').onclick = () => toast('النسخة الحالية تدعم 3 مناسبات رئيسية؛ عدّل أي مناسبة من البطاقات أعلاه.', '');

$$('.tab').forEach(btn => btn.onclick = () => {
  $$('.tab').forEach(b => b.classList.toggle('active', b === btn));
  $$('[data-panel]').forEach(p => p.classList.toggle('hidden', p.dataset.panel !== btn.dataset.tab));
});

$('#published').onchange = () => {
  if (!currentInvitation?.id && $('#published').checked === false) {
    $('#publishHint').textContent = 'الدعوة ستبقى مخفية عن الزوار حتى تنشرها.';
  }
};

boot().catch(e => { console.error(e); toast(`تعذر تشغيل لوحة التحكم: ${e.message}`, 'bad'); });
