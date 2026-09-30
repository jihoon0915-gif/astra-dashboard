"""One-time integration of Bluebird presentation with ASTRA data contracts."""
from pathlib import Path
root = Path(__file__).resolve().parent
def edit(name, old, new):
    p = root / name
    s = p.read_text(encoding='utf-8')
    if old not in s: raise ValueError('Missing patch target: '+name+' '+old[:60])
    p.write_text(s.replace(old,new),encoding='utf-8')

edit('public/js/core.js', 'export const $ =', "import { deadline as astraDeadline } from '../v2-core.mjs';\nexport const $ =")
edit('public/js/core.js', "  session: () =>", "  personal: () => call('/api/personal'),\n  savePersonal: data => call('/api/personal', {method:'POST', body:JSON.stringify(data)}),\n  comparison: () => call('/api/comparison'),\n  session: () =>")
edit('public/js/core.js', "const v = q || store.get('astra_asof') || DEMO_ASOF;", "const v = q || store.get('astra_asof') || todayKST();")
edit('public/js/core.js', "export const DEMO_ASOF = '2026-05-11';", "export const DEMO_ASOF = '2026-04-01';")
edit('public/js/core.js', "  const n = dayNum(deadline.slice(0, 10)) - dayNum(ref);", "  const now = ref === todayKST() ? Date.now() : Date.parse(ref + 'T12:00:00+09:00');\n  const result = astraDeadline(deadline, now);\n  if (!result.end) return {n:null,label:result.label,kind:'none'};\n  if (!result.open) return {n:-1,label:result.label,kind:'closed'};\n  const n = dayNum(deadline.slice(0, 10)) - dayNum(ref);")
edit('public/js/app.js', "  const CART_KEY = `astra_cart:${user.company_code}:${user.employee_id}`;\n  let cart = (store.lget(CART_KEY, []) || []).filter(x => x && x.id);\n  const inCart = id => cart.some(x => x.id === id);\n  const saveCart = () => store.lset(CART_KEY, cart);", "  let personal = await api.personal();\n  let cart = personal.favorites.map(id => ({id}));\n  const inCart = id => cart.some(x => x.id === id);\n  let cartBusy = false;")
edit('public/js/app.js', "  function toggleCart(id) {\n    const on = inCart(id);\n    cart = on ? cart.filter(x => x.id !== id) : [...cart, { id, at: Date.now() }]; saveCart();", "  async function toggleCart(id) {\n    if (cartBusy) return;\n    const on = inCart(id);\n    cartBusy = true;\n    try { personal = await api.savePersonal({action:'favorite',id}); cart = personal.favorites.map(id => ({id})); }\n    catch (e) { toast(e.message); return; }\n    finally { cartBusy = false; }")
edit('public/js/app.js', "  const PROFILES = { 'C01-2001': { name: '홍길동', team: '입찰 전략 1팀' } };\n  const prof = PROFILES[user.employee_id] || {};", "  const prof = {name:user.name || '', team:ROLE_KO[user.role] || user.role};")
edit('public/js/app.js', "user.company_name.replace(/^가상\\s*/, '')", "user.company_name")
edit('public/js/app.js', "'무엇이든 물어보세요! BlueJay가 답변해드립니다 :)'", "'ASTRA에 저장된 질문과 답변을 회사 권한에 맞춰 근거와 함께 확인하세요.'")
edit('public/js/app.js', "  let chat = store.get('astra_chat', []);", "  const chatKey = `astra_chat:${user.company_code}:${user.employee_id}`;\n  let chat = store.get(chatKey, []);")
edit('public/js/app.js', "store.set('astra_chat', chat.slice(-40))", "store.set(chatKey, chat.slice(-40))")
edit('public/js/app.js', "try { await Promise.all([getCase(id), sleep(reduced() ? 0 : 360)]); chat.push({ t: 'a', caseId: id }); }", "try { await Promise.all([getCase(id), sleep(reduced() ? 0 : 360)]); chat.push({ t: 'a', caseId: id });\n      try { personal = await api.savePersonal({action:'history',question:x.question,notice_id:x.bids?.length === 1 ? x.bids[0] : null,case_id:id}); } catch(e) { toast('답변은 조회했지만 질문 기록 저장 실패: '+e.message); }\n    }")
edit('public/js/home.js', "    if (state.user) { try { await api.logout(); } catch { } clearPrivate(); }\n    await wait; toLogin();", "    await wait; user ? go('#/app') : toLogin();")
edit('public/js/login.js', 'C01~C05 / Cxx-1001(L2), Cxx-2001(L2·L3)', 'C01~C05 / Cxx-0001(L1), Cxx-1001(L2), Cxx-2001(L2·L3)')
edit('public/js/app.js', '<div class="doc"><span class="lv', '<div class="doc"><button class="linkbtn" data-doc="${esc(d.document_id)}">원문 보기</button><span class="lv')
edit('public/js/app.js', '문서 원문 뷰어는 본 화면 재구축 때 연결됩니다.', '원문 보기는 현재 계정의 회사·보안등급 권한을 다시 확인합니다.')
edit('public/js/app.js', "  // 마이페이지 —", "  listBody.addEventListener('click', async e => {\n    const button = e.target.closest('[data-doc]'); if (!button) return;\n    try { const d = await api.document(button.dataset.doc); showDataDialog(d.metadata.title, `<p>${esc(d.metadata.security_level)} · 합성 회사 자료</p><pre>${esc(d.text)}</pre>`); } catch(e) { toast(e.message); }\n  });\n  function showDataDialog(title, body) {\n    const dialog = document.createElement('dialog'); dialog.className = 'astra-data-dialog';\n    dialog.innerHTML = `<header><h2>${esc(title)}</h2><button aria-label=\"닫기\">✕</button></header><div>${body}</div>`;\n    document.body.append(dialog); dialog.querySelector('header button').onclick = () => dialog.close();\n    dialog.addEventListener('close', () => dialog.remove(), {once:true}); dialog.showModal();\n  }\n  cleanup.push(() => document.querySelectorAll('.astra-data-dialog').forEach(d => d.remove()));\n\n  // 마이페이지 —")
edit('public/js/app.js', '<section class="mp-docs"><h4>회사문서', '<section class="mp-docs"><button class="linkbtn" id="personalHistory">최근 질문</button> ${user.can_compare ? \'<button class="linkbtn" id="accessCompare">권한별 비교</button>\' : \'\'}</section><section class="mp-docs"><h4>회사문서')
edit('public/js/app.js', "    document.body.append(back, p);", """    document.body.append(back, p);
    p.querySelector('#personalHistory').onclick = async () => {
      try {
        personal = await api.personal();
        showDataDialog('최근 질문', personal.history.map(h => `<article><button class="linkbtn" data-history-case="${esc(h.case_id || '')}">${esc(h.question)}</button></article>`).join('') || '<p>저장된 질문이 없습니다.</p>');
        document.querySelectorAll('[data-history-case]').forEach(b => b.onclick = () => {if(b.dataset.historyCase) {document.querySelector('.astra-data-dialog').close();closeMyPage();askCase(b.dataset.historyCase);}});
      } catch(e) {toast(e.message);}
    };
    p.querySelector('#accessCompare')?.addEventListener('click', async () => {
      try { const d = await api.comparison(); showDataDialog('권한별 비교', `<h3>${esc(d.question)}</h3><p>시연용 작성 답변 · 사람 검토 대기</p>` + d.variants.map(v => `<article><h3>${esc(v.level)}</h3><pre>${esc(v.answer)}</pre></article>`).join('')); } catch(e) {toast(e.message);}
    });""")
with (root/'public/css/astra.css').open('a',encoding='utf-8') as f:
    f.write('\n.astra-data-dialog{width:min(900px,90vw);max-height:85vh;border:1px solid #dbe5f1;border-radius:24px;padding:28px;color:#0E1A2B;background:#f8fbff;box-shadow:0 24px 90px #12294d40}.astra-data-dialog::backdrop{background:#10203866}.astra-data-dialog header{display:flex;justify-content:space-between;gap:20px;margin-bottom:20px}.astra-data-dialog pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;line-height:1.8}.astra-data-dialog article{padding:16px 0;border-top:1px solid #dbe5f1}\n')
print('Bluebird UI connected to ASTRA data and personal records.')
