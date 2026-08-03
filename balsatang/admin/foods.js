/* 사료 관리 — 발행된 데이터를 고치고 GitHub 에 바로 커밋한다.

   지금까지는 한 번 발행하면 손댈 방법이 없었다. 가격이 바뀌어도, 썸네일이
   틀려도, 구매 링크를 새로 받아도 전부 로컬에서 스크립트를 돌려야 했다.
   이 화면이 그 자리를 메운다.

   ── 무엇을 고칠 수 있나 ──
   브랜드·제품명·제형·원산지·연령/체형, 썸네일, 가격, 구매 링크.
   즉 "사람이 눈으로 확인해서 고치는 값"만 연다.

   ── 무엇을 못 고치나 ──
   별점(ratings)과 총점(score)은 직접 못 고친다. 루브릭이 계산하는 값이고,
   사람이 손대는 순간 점수의 근거가 사라진다. 가격을 바꿔서 가성비 구간이
   달라지면 "다시 계산할까요?" 를 물어보고, 사람이 눌러야 반영한다.
   원료·영양 수치도 여기서는 못 고친다 — 그건 출처와 증거가 같이 바뀌어야
   하는 값이라 심사 화면(스테이징)의 몫이다.

   ── 파일을 어떻게 고치나 ──
   data.js 는 선언 하나가 한 줄이다(1행 FOODS_ALL, 3행 DETAIL). 그래서
   그 두 줄만 통째로 갈아끼운다. ICONS 같은 나머지 줄은 원문 그대로 둔다.
   전체를 다시 직렬화하면 손대지 않은 곳까지 diff 가 뒤집힌다.
*/
'use strict';

const PATH = 'balsatang/data.js';

const TYPE_KO = { dry: '건식', wet: '습식', freeze_dried: '동결건조', air_dried: '에어드라이', raw: '화식', topping: '토핑' };
const AGE_KO = { puppy: '퍼피', adult: '성견', senior: '시니어', all: '전연령' };
const SIZE_KO = { small: '소형', medium: '중형', large: '대형', all: '전체' };
const SHOP_KO = { coupang: '쿠팡', brand_official: '공식몰', naver: '네이버', other: '판매처' };
const COUNTRY_KO = {
  KR: '대한민국', CA: '캐나다', US: '미국', FR: '프랑스', NZ: '뉴질랜드', AU: '호주',
  DE: '독일', IT: '이탈리아', NL: '네덜란드', BE: '벨기에', GB: '영국', JP: '일본', TH: '태국'
};

/* 루브릭 — scripts/lib/rubric.mjs 의 rateValue 와 같은 구간이어야 한다.
   여기서 쓰는 건 가격을 고쳤을 때 가성비 별점이 달라지는지 보여주기 위해서다. */
function rateValue(pKg) {
  if (pKg == null) return null;
  if (pKg <= 10000) return 5;
  if (pKg <= 16000) return 4;
  if (pKg <= 32000) return 3;
  if (pKg <= 45000) return 2;
  return 1;
}
const SCORE_WEIGHT = { quality: 0.45, additive: 0.28, carb: 0.20, value: 0.07 };
function computeScore(r) {
  const w = SCORE_WEIGHT;
  return Math.round(2 * (w.quality * r.quality + w.additive * r.additive +
    w.carb * r.carb + w.value * r.value) * 10) / 10;
}
const PRICE_KG = { min: 1000, max: 200000 };

/* ── 상태 ── */
const S = {
  sha: null,
  lines: null,        // data.js 원문을 줄 단위로 보관. 우리가 고치는 건 2줄뿐이다.
  iFoods: -1, iDetail: -1,
  foods: [], detail: {},
  orig: new Map(),    // id → 원본 food JSON 문자열
  origDetail: new Map(),
  cur: null,          // 패널에서 편집 중인 food
  q: '', filter: 'all'
};

/* ── 잡동사니 ── */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const won = n => (n ?? 0).toLocaleString('ko-KR');
const clone = o => JSON.parse(JSON.stringify(o));
let toastT;
function toast(msg, err) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.toggle('err', !!err);
  t.classList.add('on');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('on'), err ? 4200 : 2200);
}
const get = (o, p) => p.split('.').reduce((x, k) => (x == null ? x : x[k]), o);
function set(o, p, v) {
  const ks = p.split('.');
  const last = ks.pop();
  let t = o;
  for (const k of ks) { if (t[k] == null || typeof t[k] !== 'object') t[k] = {}; t = t[k]; }
  if (v === null || v === '') delete t[last]; else t[last] = v;
}

/* ── data.js 읽기 ──
   선언 한 줄을 통째로 JSON.parse 한다. 형태가 조금이라도 다르면 파싱을
   포기하고 편집을 막는다. 짐작해서 고치면 파일이 깨진다. */
function pickDecl(lines, name) {
  const head = `const ${name}=`;
  const i = lines.findIndex(l => l.startsWith(head));
  if (i < 0) return { i: -1, value: null };
  const body = lines[i].slice(head.length).replace(/;\s*$/, '');
  try { return { i, value: JSON.parse(body) }; }
  catch { return { i: -1, value: null }; }
}

async function load() {
  $('#meta').textContent = '불러오는 중…';
  const file = await GH.getFile(PATH);
  S.sha = file.sha;
  S.lines = file.text.split('\n');

  const a = pickDecl(S.lines, 'FOODS_ALL');
  const d = pickDecl(S.lines, 'DETAIL');
  if (a.i < 0 || d.i < 0) {
    throw new Error('data.js 형태가 예상과 달라 편집할 수 없습니다. 로컬에서 확인해 주세요');
  }
  S.iFoods = a.i; S.iDetail = d.i;
  S.foods = a.value; S.detail = d.value;
  S.orig = new Map(S.foods.map(f => [f.id, JSON.stringify(f)]));
  S.origDetail = new Map(Object.entries(S.detail).map(([k, v]) => [k, JSON.stringify(v)]));

  $('#meta').textContent = `${S.foods.length}종 · ${S.sha.slice(0, 7)}`;
  render();
}

/* ── 변경 여부 ── */
const dirtyFood = f => S.orig.get(f.id) !== JSON.stringify(f);
/* DETAIL 이 아예 없는 사료가 있다(분석 전). '없음' 과 '없음' 을 같게 봐야 한다 —
   여기서 undefined 와 "null" 을 비교하면 열어보지도 않은 사료가 수정됨으로 잡힌다. */
const dirtyDetail = id =>
  (S.origDetail.get(id) ?? null) !== (S.detail[id] ? JSON.stringify(S.detail[id]) : null);
const isDirty = f => dirtyFood(f) || dirtyDetail(f.id);
const dirtyList = () => S.foods.filter(isDirty);

/* ── 목록 ── */
const analyzed = f => !!(S.detail[f.id]?.ingr || []).length;
const buyOf = f => f.price?.buyUrl || (S.detail[f.id]?.prices || []).find(p => p.url)?.url || null;

const FILTERS = [
  { k: 'all', label: '전체' },
  { k: 'nothumb', label: '썸네일 없음', test: f => !f.thumb },
  { k: 'nobuy', label: '구매링크 없음', test: f => !buyOf(f) },
  { k: 'noprice', label: '가격 없음', test: f => !f.price?.p },
  { k: 'pending', label: '분석 준비 중', test: f => !analyzed(f) },
  { k: 'rx', label: '처방식', test: f => !!f.rx },
  { k: 'edited', label: '수정함', test: isDirty }
];

function visible() {
  const q = S.q.trim().toLowerCase();
  const f0 = FILTERS.find(x => x.k === S.filter);
  return S.foods.filter(f => {
    if (f0?.test && !f0.test(f)) return false;
    if (!q) return true;
    return (`${f.brand} ${f.name}`).toLowerCase().includes(q);
  });
}

function render() {
  const rows = visible();
  const counts = {};
  for (const x of FILTERS) counts[x.k] = x.test ? S.foods.filter(x.test).length : S.foods.length;

  $('#wrap').innerHTML = `
    <div class="note">발행된 데이터를 직접 고쳐 GitHub 에 커밋합니다. 커밋하면 CI 가 검증을 돌리고,
      통과하면 몇 분 뒤 사이트에 반영돼요. 별점·총점·원료·영양 수치는 여기서 고칠 수 없어요 —
      그건 근거가 같이 바뀌어야 하는 값이라 심사 화면의 몫이에요.</div>
    <div class="bar">
      <input class="search" id="q" placeholder="브랜드 · 제품명 검색" value="${esc(S.q)}">
      ${FILTERS.map(x => `<button class="chip ${S.filter === x.k ? 'on' : ''}" data-filter="${x.k}">${x.label} ${counts[x.k]}</button>`).join('')}
    </div>
    ${rows.length ? `<table>
      <thead><tr>
        <th style="width:52px"></th><th>사료</th><th style="width:76px">제형</th>
        <th style="width:130px" class="num">가격</th><th style="width:96px" class="num">kg당</th>
        <th style="width:210px">상태</th>
      </tr></thead>
      <tbody>${rows.map(rowHtml).join('')}</tbody>
    </table>` : `<div class="empty"><b>해당하는 사료가 없어요</b>다른 조건으로 찾아보세요</div>`}
  `;

  /* 한글은 조합 중에도 input 이 계속 뜬다. 그때 목록을 다시 그리면 입력칸이
     새로 만들어지면서 조합이 끊겨 글자가 깨진다. 조합이 끝난 뒤에 그린다. */
  const qi = $('#q');
  let composing = false;
  const apply = () => {
    if (composing) return;
    const at = qi.selectionStart;
    S.q = qi.value;
    render();
    const n = $('#q'); n.focus(); n.setSelectionRange(at, at);
  };
  qi.addEventListener('compositionstart', () => { composing = true; });
  qi.addEventListener('compositionend', () => { composing = false; apply(); });
  qi.addEventListener('input', apply);
  for (const b of document.querySelectorAll('[data-filter]'))
    b.onclick = () => { S.filter = b.dataset.filter; render(); };
  for (const tr of document.querySelectorAll('[data-id]'))
    tr.onclick = () => openPanel(tr.dataset.id);

  const dl = dirtyList();
  $('#dock').hidden = dl.length === 0;
  $('#count').innerHTML = `<b>${dl.length}건</b> 수정함 — ${dl.map(f => esc(f.name)).slice(0, 3).join(', ')}${dl.length > 3 ? ' 외' : ''}`;
}

function rowHtml(f) {
  const pills = [];
  if (!f.thumb) pills.push('<span class="pill no">썸네일 없음</span>');
  if (!buyOf(f)) pills.push('<span class="pill wa">구매링크 없음</span>');
  if (!analyzed(f)) pills.push('<span class="pill wa">분석 준비 중</span>');
  if (f.rx) pills.push('<span class="pill ok">처방식</span>');
  if (!pills.length) pills.push('<span class="pill ok">정상</span>');
  return `<tr data-id="${f.id}" class="${isDirty(f) ? 'edited' : ''}">
    <td>${f.thumb
      ? `<img class="thumb" src="${esc(f.thumb)}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'thumb none',textContent:'?'}))">`
      : `<div class="thumb none">?</div>`}</td>
    <td><div class="br">${esc(f.brand)}</div><div class="nm">${esc(f.name)}</div></td>
    <td>${TYPE_KO[f.type] || esc(f.type || '')}</td>
    <td class="num">${f.price?.p ? won(f.price.p) + '원' : '—'}<div class="br">${f.price?.wg ? f.price.wg + 'g' : ''}</div></td>
    <td class="num">${f.price?.pKg ? won(f.price.pKg) : '—'}</td>
    <td>${pills.join(' ')}</td>
  </tr>`;
}

/* ── 편집 패널 ── */
const FIELDS = [
  { k: 'brand', label: '브랜드' },
  { k: 'brandSlug', label: '브랜드 슬러그' },
  { k: 'name', label: '제품명', wide: true },
  { k: 'type', label: '제형', sel: TYPE_KO },
  { k: 'country', label: '원산지', sel: COUNTRY_KO },
  { k: 'rx', label: '처방식 여부', sel: { '': '일반', '1': '처방식' }, bool: true },
  { k: 'thumb', label: '썸네일 URL', wide: true, hint: '쿠팡·다나와 상품 이미지 주소' }
];

function openPanel(id) {
  const f = S.foods.find(x => x.id === id);
  if (!f) return;
  S.cur = f;
  $('#panelTitle').textContent = `${f.brand} ${f.name}`;
  $('#panelBody').innerHTML = panelHtml(f);
  bindPanel(f);
  $('#panel').classList.add('on');
  $('#dim').classList.add('on');
}
function closePanel() {
  S.cur = null;
  $('#panel').classList.remove('on');
  $('#dim').classList.remove('on');
  render();
}

function panelHtml(f) {
  const o = JSON.parse(S.orig.get(f.id));
  const d = S.detail[f.id] || {};
  const prices = d.prices || [];

  const field = spec => {
    const v = get(f, spec.k);
    const ov = get(o, spec.k);
    const changed = JSON.stringify(v ?? null) !== JSON.stringify(ov ?? null);
    const inner = spec.sel
      ? `<select data-k="${spec.k}"${spec.bool ? ' data-bool="1"' : ''}>${Object.entries(spec.sel)
        .map(([k, l]) => `<option value="${esc(k)}"${String(spec.bool ? (v ? '1' : '') : (v ?? '')) === k ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`
      : `<input data-k="${spec.k}" value="${esc(v ?? '')}"${spec.num ? ' inputmode="numeric"' : ''}>`;
    return `<div class="f ${changed ? 'ch' : ''}" style="${spec.wide ? 'grid-column:1/-1' : ''}">
      <label>${spec.label}</label>${inner}
      <div class="was">${changed ? `원래: ${esc(fmt(ov))}` : (spec.hint || '')}</div></div>`;
  };

  const multi = (k, dict) => {
    const cur = f[k] || [];
    const changed = JSON.stringify(cur) !== JSON.stringify(o[k] || []);
    return `<div class="f ${changed ? 'ch' : ''}"><label>${k === 'ages' ? '연령' : '체형'}</label>
      <div style="display:flex;gap:7px;flex-wrap:wrap">${Object.entries(dict).map(([v, l]) =>
      `<button class="chip ${cur.includes(v) ? 'on' : ''}" data-multi="${k}" data-v="${v}">${l}</button>`).join('')}</div>
      <div class="was">${changed ? `원래: ${esc((o[k] || []).map(x => dict[x] || x).join(', ') || '없음')}` : ''}</div></div>`;
  };

  return `
  <div class="sect" style="margin-top:0">기본 정보</div>
  <div class="grid2">${FIELDS.map(field).join('')}</div>
  ${multi('ages', AGE_KO)}${multi('sizes', SIZE_KO)}

  <div class="sect">썸네일</div>
  <div style="display:flex;gap:12px;align-items:center">
    <div style="width:84px;height:84px;border-radius:10px;background:#fff;display:grid;place-items:center;overflow:hidden">
      ${f.thumb ? `<img src="${esc(f.thumb)}" style="max-width:100%;max-height:100%;object-fit:contain">`
      : `<span style="color:#888;font-size:11px">없음</span>`}</div>
    <div style="flex:1;color:var(--sub);font-size:11.5px;line-height:1.6">
      사료 봉지 사진이어야 해요. 브랜드 로고나 다른 제품 사진이면 사용자가 헷갈려요.
      URL 을 바꾸고 <b style="color:var(--ink2)">적용</b>을 누르면 위 미리보기가 갱신돼요.</div>
  </div>

  <div class="sect">대표 가격 <span style="font-weight:500;color:var(--muted)">— 목록·카드에 쓰는 값</span></div>
  <div class="grid2">
    ${field({ k: 'price.p', label: '가격 (원)', num: true })}
    ${field({ k: 'price.wg', label: '용량 (g)', num: true })}
    ${field({ k: 'price.shop', label: '판매처', sel: SHOP_KO })}
    ${field({ k: 'price.buyUrl', label: '구매 링크', wide: true, hint: '쿠팡 파트너스 링크 (link.coupang.com)' })}
  </div>
  <div class="derived" id="derived"></div>

  <div class="sect">판매처별 가격 <span style="font-weight:500;color:var(--muted)">— 상세 화면 최저가 비교</span></div>
  <div id="prices">${prices.map(priceRow).join('') || '<div class="was" style="color:var(--muted)">등록된 행이 없어요. 대표 가격이 대신 보여요.</div>'}</div>
  <button class="btn" data-addprice style="margin-top:8px">행 추가</button>

  <div class="sect">분석 데이터 <span style="font-weight:500;color:var(--muted)">— 읽기 전용</span></div>
  <div class="derived">
    ${d.ingr?.length
      ? `주원료 <b>${d.ingr.length}종</b> · 안전 ${d.dist?.safe ?? 0} / 주의 ${d.dist?.caution ?? 0} / 위험 ${d.dist?.danger ?? 0} / 미상 ${d.dist?.unknown ?? 0}<br>
         조단백 <b>${d.nutrient?.protein ?? '—'}%</b> · 조지방 <b>${d.nutrient?.fat ?? '—'}%</b> · 건물기준 탄수 <b>${d.nutrient?.dmCarb ?? '—'}%</b>`
      : '아직 분석 전이에요. 성분표를 확보하면 심사 화면에서 등록해요.'}
    <br>별점 원료 ${f.ratings?.quality ?? '—'} · 첨가물 ${f.ratings?.additive ?? '—'} · 탄수 ${f.ratings?.carb ?? '—'} · 가성비 ${f.ratings?.value ?? '—'}
  </div>`;
}

function priceRow(p, i) {
  return `<div style="display:grid;grid-template-columns:88px 1fr 90px 28px;gap:6px;margin-bottom:6px" data-prow="${i}">
    <input data-pk="wg" value="${esc(p.wg ?? '')}" placeholder="용량g" inputmode="numeric">
    <input data-pk="url" value="${esc(p.url ?? '')}" placeholder="구매 링크">
    <input data-pk="price" value="${esc(p.price ?? '')}" placeholder="가격" inputmode="numeric">
    <button class="btn" data-delprice="${i}" style="padding:0">✕</button>
  </div>`;
}

function fmt(v) {
  if (v == null || v === '') return '없음';
  if (v === true) return '처방식';
  if (v === false) return '일반';
  if (Array.isArray(v)) return v.join(', ');
  return String(v);
}

/* 대표 가격에서 파생되는 값 — kg당 가격과, 그로 인해 달라지는 가성비 별점 */
function refreshDerived() {
  const f = S.cur;
  if (!f) return;
  const box = $('#derived');
  if (!box) return;
  const p = Number(f.price?.p) || null, wg = Number(f.price?.wg) || null;
  const pKg = (p && wg) ? Math.round(p / wg * 1000) : null;
  const cur = f.ratings?.value ?? null;
  const next = rateValue(pKg);
  const out = [];
  out.push(pKg ? `kg당 <b>${won(pKg)}원</b>` : 'kg당 가격 — 가격과 용량을 둘 다 넣어야 계산돼요');
  if (pKg && (pKg < PRICE_KG.min || pKg > PRICE_KG.max))
    out.push(`<span style="color:var(--warn)">kg당 가격이 상식 범위(${won(PRICE_KG.min)}~${won(PRICE_KG.max)}원)를 벗어났어요. 오타인지 확인해 주세요</span>`);
  if (next != null && cur != null && next !== cur) {
    out.push(`이 가격이면 가성비 별점은 <b>${next}점</b>이에요 (지금 ${cur}점).
      <label style="display:inline-flex;gap:6px;align-items:center;margin-left:6px;color:var(--warn)">
        <input type="checkbox" id="reScore" style="width:auto" ${f.__reScore ? 'checked' : ''}> 별점·총점 다시 계산</label>`);
  }
  box.innerHTML = out.join('<br>');
  const cb = $('#reScore');
  /* 껐다 켰다 한 흔적이 남으면 고치지도 않은 사료가 '수정함' 으로 잡힌다 */
  if (cb) cb.onchange = () => { if (cb.checked) f.__reScore = true; else delete f.__reScore; };
}

function bindPanel(f) {
  const body = $('#panelBody');
  for (const el of body.querySelectorAll('[data-k]')) {
    el.oninput = el.onchange = () => {
      const k = el.dataset.k;
      let v = el.value;
      if (el.dataset.bool) v = v === '1';
      else if (/price\.(p|wg)$/.test(k)) v = v.trim() === '' ? null : Number(String(v).replace(/[^\d.-]/g, ''));
      else if (typeof v === 'string') v = v.trim();
      set(f, k, v);
      if (/price\.(p|wg)$/.test(k)) {
        const p = Number(f.price?.p), wg = Number(f.price?.wg);
        if (p && wg) f.price.pKg = Math.round(p / wg * 1000); else delete f.price?.pKg;
      }
      refreshDerived();
    };
  }
  for (const b of body.querySelectorAll('[data-multi]')) {
    b.onclick = () => {
      const k = b.dataset.multi, v = b.dataset.v;
      const arr = f[k] = f[k] || [];
      const i = arr.indexOf(v);
      if (i < 0) arr.push(v); else arr.splice(i, 1);
      $('#panelBody').innerHTML = panelHtml(f); bindPanel(f);
    };
  }
  const d = S.detail[f.id];
  for (const el of body.querySelectorAll('[data-pk]')) {
    el.oninput = () => {
      const i = Number(el.closest('[data-prow]').dataset.prow);
      const row = d.prices[i];
      const k = el.dataset.pk;
      const v = el.value.trim();
      if (k === 'url') row.url = v || null;
      else {
        row[k] = v === '' ? null : Number(v.replace(/[^\d]/g, ''));
        if (row.price && row.wg) row.pKg = Math.round(row.price / row.wg * 1000);
      }
    };
  }
  for (const b of body.querySelectorAll('[data-delprice]')) {
    b.onclick = () => {
      d.prices.splice(Number(b.dataset.delprice), 1);
      $('#panelBody').innerHTML = panelHtml(f); bindPanel(f);
    };
  }
  const add = body.querySelector('[data-addprice]');
  if (add) add.onclick = () => {
    const dd = S.detail[f.id] = S.detail[f.id] || {};
    (dd.prices = dd.prices || []).push({ wg: f.price?.wg ?? null, shop: 'coupang', price: null, pKg: null, url: null, avail: true });
    $('#panelBody').innerHTML = panelHtml(f); bindPanel(f);
  };
  refreshDerived();
}

/* ── 검증 ── 커밋 전에 기계가 잡을 수 있는 건 여기서 잡는다. */
function validate() {
  const out = [];
  for (const f of dirtyList()) {
    const at = `${f.brand} ${f.name}`;
    if (!f.brand?.trim() || !f.name?.trim()) out.push(`${at} — 브랜드와 제품명은 비울 수 없어요`);
    if (f.thumb && !/^(https:\/\/|\/)/.test(f.thumb)) out.push(`${at} — 썸네일은 https 주소여야 해요`);
    if (!(f.ages || []).length) out.push(`${at} — 연령을 최소 하나 골라주세요`);
    if (!(f.sizes || []).length) out.push(`${at} — 체형을 최소 하나 골라주세요`);
    const p = f.price?.p, wg = f.price?.wg;
    if (p != null && !(p > 0)) out.push(`${at} — 가격이 숫자가 아니에요`);
    if (wg != null && !(wg > 0)) out.push(`${at} — 용량이 숫자가 아니에요`);
    if (p && !wg) out.push(`${at} — 가격을 넣었으면 용량도 있어야 kg당 가격이 나와요`);
    for (const url of [f.price?.buyUrl, ...(S.detail[f.id]?.prices || []).map(x => x.url)]) {
      if (!url) continue;
      if (!/^https:\/\/(link\.coupang\.com|www\.coupang\.com|m\.coupang\.com)\//.test(url))
        out.push(`${at} — 구매 링크는 쿠팡 주소여야 해요: ${url}`);
    }
    for (const row of (S.detail[f.id]?.prices || [])) {
      if (row.price && !row.wg) out.push(`${at} — 판매처 가격 행에 용량이 비었어요`);
    }
  }
  return out;
}

/* ── 커밋 ── */
function serialize() {
  const lines = S.lines.slice();
  /* 별점을 다시 계산하기로 한 건만 반영한다. 나머지는 원래 점수를 그대로 둔다 —
     예전 41종은 지금 루브릭이 아니라 원본 앱의 점수를 물려받았고,
     여기서 전부 다시 계산하면 손대지 않은 사료의 점수까지 움직인다. */
  const foods = S.foods.map(f => {
    const c = { ...f };
    delete c.__reScore;
    if (f.__reScore && c.ratings && c.price?.pKg != null) {
      c.ratings = { ...c.ratings, value: rateValue(c.price.pKg) };
      if (Object.values(c.ratings).every(v => v != null)) c.score = computeScore(c.ratings);
    }
    return c;
  });
  lines[S.iFoods] = 'const FOODS_ALL=' + JSON.stringify(foods) + ';';
  lines[S.iDetail] = 'const DETAIL=' + JSON.stringify(S.detail) + ';';
  return lines.join('\n');
}

function commitMessage(dl) {
  const head = dl.length === 1
    ? `사료 수정 — ${dl[0].brand} ${dl[0].name}`
    : `사료 수정 — ${dl.length}건`;
  const body = dl.map(f => {
    const o = JSON.parse(S.orig.get(f.id));
    const ch = [];
    for (const k of ['brand', 'name', 'brandSlug', 'type', 'country', 'rx', 'thumb'])
      if (JSON.stringify(f[k] ?? null) !== JSON.stringify(o[k] ?? null)) ch.push(k);
    for (const k of ['p', 'wg', 'shop', 'buyUrl'])
      if (JSON.stringify(f.price?.[k] ?? null) !== JSON.stringify(o.price?.[k] ?? null)) ch.push('price.' + k);
    for (const k of ['ages', 'sizes'])
      if (JSON.stringify(f[k] ?? null) !== JSON.stringify(o[k] ?? null)) ch.push(k);
    if (f.__reScore) ch.push('ratings.value', 'score');
    if (dirtyDetail(f.id)) ch.push('prices');
    return `- ${f.brand} ${f.name}: ${ch.join(', ') || '변경'}`;
  }).join('\n');
  return `${head}\n\n${body}\n\n어드민 화면에서 커밋했습니다.`;
}

async function commit() {
  const dl = dirtyList();
  if (!dl.length) return;
  const errs = validate();
  if (errs.length) { toast(errs[0], true); return; }
  if (!confirm(`${dl.length}건을 main 에 커밋합니다.\n\n${dl.map(f => `· ${f.brand} ${f.name}`).join('\n')}`)) return;

  const btn = $('#commit');
  btn.disabled = true; btn.textContent = '커밋 중…';
  try {
    const res = await GH.putFile(PATH, serialize(), S.sha, commitMessage(dl));
    S.sha = res.content.sha;
    S.orig = new Map(S.foods.map(f => { delete f.__reScore; return [f.id, JSON.stringify(f)]; }));
    S.origDetail = new Map(Object.entries(S.detail).map(([k, v]) => [k, JSON.stringify(v)]));
    $('#meta').textContent = `${S.foods.length}종 · ${S.sha.slice(0, 7)}`;
    toast(`커밋했어요 — ${res.commit.sha.slice(0, 7)}. 몇 분 뒤 사이트에 반영돼요`);
    render();
  } catch (e) {
    toast(e.message, true);
  } finally {
    btn.disabled = false; btn.textContent = 'GitHub 에 커밋';
  }
}

/* ── 토큰 ── */
async function askToken() {
  const cur = GH.token;
  const v = prompt(
    'fine-grained personal access token 을 넣어주세요.\n' +
    '· Repository access: butblank-oss/gsso_scat 하나만\n' +
    '· Permissions: Contents = Read and write\n' +
    '· Expiration: 되도록 짧게\n\n' +
    '이 브라우저에만 저장되고 저장소에는 들어가지 않아요. 비우면 삭제돼요.',
    cur ? '••••••••' : '');
  if (v === null) return;
  if (v === '••••••••') return;
  GH.token = v.trim();
  await boot();
}

async function boot() {
  if (!GH.token) {
    $('#meta').textContent = '토큰이 필요해요';
    $('#wrap').innerHTML = `<div class="empty"><b>먼저 토큰을 넣어주세요</b>
      오른쪽 위 <b>토큰</b> 버튼을 누르면 넣을 수 있어요.</div>`;
    return;
  }
  try {
    const who = await GH.check();
    if (!who.canWrite) throw new Error(`${who.name} 에 쓰기 권한이 없는 토큰이에요`);
    await load();
  } catch (e) {
    $('#meta').textContent = '오류';
    $('#wrap').innerHTML = `<div class="empty"><b>${esc(e.message)}</b>토큰을 다시 확인해 주세요.</div>`;
  }
}

$('#tokenBtn').onclick = askToken;
$('#panelClose').onclick = closePanel;
$('#panelDone').onclick = closePanel;
$('#dim').onclick = closePanel;
$('#panelReset').onclick = () => {
  const f = S.cur;
  if (!f) return;
  if (!confirm('이 사료의 수정을 전부 되돌릴까요?')) return;
  Object.assign(f, JSON.parse(S.orig.get(f.id)));
  for (const k of Object.keys(f)) if (!(k in JSON.parse(S.orig.get(f.id)))) delete f[k];
  const od = S.origDetail.get(f.id);
  if (od) S.detail[f.id] = JSON.parse(od);
  closePanel();
};
$('#revert').onclick = () => {
  if (!confirm('수정한 내용을 전부 되돌릴까요?')) return;
  S.foods = S.foods.map(f => JSON.parse(S.orig.get(f.id)));
  for (const [k, v] of S.origDetail) S.detail[k] = JSON.parse(v);
  render();
};
$('#commit').onclick = commit;
addEventListener('keydown', e => { if (e.key === 'Escape' && S.cur) closePanel(); });
addEventListener('beforeunload', e => { if (dirtyList().length) { e.preventDefault(); e.returnValue = ''; } });

boot();
