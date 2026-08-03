'use strict';
const { store, CATEGORY_KO, SAFE_KO, FUNC_KO, TYPE_KO, AGE_KO, SIZE_KO, SHOP_KO,
        COUNTRY_KO, CONCERN_KO, estimateCarb, totalScore, autoHeadline, uid, clone } = BS;

const $  = s => document.querySelector(s);
const el = id => document.getElementById(id);
const esc = s => String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const at  = s => esc(s).replace(/"/g,'&quot;');
const ico = (n,z=16) => ICONS[n] ? `<svg class="i" width="${z}" height="${z}" viewBox="0 0 24 24">${ICONS[n]}</svg>` : '';
const opts = (o,sel,ph) => (ph?`<option value="">${ph}</option>`:'')
  + Object.entries(o).map(([k,v])=>`<option value="${k}"${k===sel?' selected':''}>${v}</option>`).join('');

let toastT;
function toast(m){ const t=el('toast'); t.textContent=m; t.classList.add('on');
  clearTimeout(toastT); toastT=setTimeout(()=>t.classList.remove('on'),1900); }
function save(){
  const ok = store.save();
  markDirty();
  if(ok === false) toast('브라우저 저장 용량이 가득 찼어요 — 내보내기로 파일을 받아주세요');
  return ok;
}
function markDirty(){ el('dirtyDot').innerHTML = store.dirty ? '<span class="dirty-dot"></span>' : ''; }

/* ═══ 한글 입력 ═══
   한글은 한 글자를 만드는 동안에도 input 이벤트가 계속 뜬다(조합 중).
   그때 목록을 다시 그리면 입력칸이 통째로 새로 만들어지면서 조합이 끊겨
   글자가 깨진다. 그래서 조합 중에는 그리지 않고, 조합이 끝나면 input 을
   한 번 더 흘려보내 그때 그린다. */
const IME = { on:false };
addEventListener('compositionstart', ()=>{ IME.on = true; }, true);
addEventListener('compositionend', e=>{
  IME.on = false;
  e.target.dispatchEvent(new Event('input', { bubbles:true }));
}, true);

/* 다시 그리면 포커스와 캐럿이 날아간다. 같은 자리(placeholder)의 입력칸을 찾아 되돌린다. */
function ime(fn){
  if(IME.on) return;
  const a = document.activeElement;
  const ph = a && a.tagName === 'INPUT' ? a.getAttribute('placeholder') : null;
  const at = a && a.selectionStart;
  fn();
  if(!ph) return;
  const n = [...document.querySelectorAll('input')].find(i=>i.getAttribute('placeholder')===ph);
  if(n){ n.focus(); try{ n.setSelectionRange(at, at); }catch{} }
}

/* ═══ NAV ═══ */
const NAV = [
  {h:'메인'},
  {k:'dash',   label:'대시보드',    ico:'chart'},
  {h:'콘텐츠 관리'},
  {k:'foods',  label:'사료 관리',    ico:'package'},
  {k:'ingr',   label:'성분 관리',    ico:'microscope'},
  {k:'tags',   label:'맞춤찾기 태그', ico:'paw'},
  {h:'운영'},
  {k:'recall', label:'리콜 관리',    ico:'siren', badge:()=>store.recalls.filter(r=>r.active).length},
  {k:'price',  label:'가격 관리',    ico:'coins'},
  {k:'article',label:'콘텐츠',       ico:'book'},
  {k:'review', label:'리뷰 관리',    ico:'star'}
];
const TITLES = {dash:'대시보드', foods:'사료 관리', ingr:'성분 관리', tags:'맞춤찾기 태그 관리',
  recall:'리콜 관리', price:'가격 관리', article:'콘텐츠 관리', review:'리뷰 관리',
  wizard:'사료 등록'};

let page = 'dash';
function renderNav(){
  el('nav').innerHTML = NAV.map(n=>{
    if(n.h) return `<div class="nav-h">${n.h}</div>`;
    const b = n.badge ? n.badge() : 0;
    return `<button class="nav-i${n.k===page?' on':''}" onclick="go('${n.k}')">
      ${ico(n.ico,15)}${n.label}${b?`<span class="dot">${b}</span>`:''}</button>`;
  }).join('');
}
function go(k, arg){
  page = k;
  el('pgTitle').textContent = TITLES[k] || '';
  renderNav();
  ({dash:pgDash, foods:pgFoods, ingr:pgIngr, tags:pgTags, recall:pgRecall,
    price:pgPrice, article:pgArticle, review:pgReview, wizard:pgWizard}[k] || pgDash)(arg);
  el('wrap').scrollTop = 0;
}

/* ═══ 대시보드 ═══ */
function pgDash(){
  const active = store.recalls.filter(r=>r.active).length;
  const pub = store.foods.filter(f=>f.status==='published').length;
  const draft = store.foods.filter(f=>f.status==='draft').length;
  const noPrice = store.foods.filter(f=>!f.prices.length).length;
  const priceN = store.foods.reduce((a,f)=>a+f.prices.length,0);
  const unknown = store.unknownIngredients().length;
  const recent = store.foods.slice(0,4);
  const todos = [
    active   ? {c:'var(--bad)',  t:`활성 리콜 ${active}건 — 즉시 확인 필요`, a:'처리하기', go:'recall'} : null,
    draft    ? {c:'var(--warn)', t:`임시저장 ${draft}건 발행 검토`,          a:'검토하기', go:'foods'}  : null,
    noPrice  ? {c:'var(--warn)', t:`가격 미등록 ${noPrice}종 업데이트`,      a:'업데이트', go:'price'}  : null,
    unknown  ? {c:'var(--pri)',  t:`성분 사전에 없는 원료 ${unknown}종`,     a:'등록하기', go:'ingr'}   : null,
    {c:'var(--pri)', t:'이번 주 콘텐츠 1건 발행 예정', a:'작성하기', go:'article'}
  ].filter(Boolean);

  el('wrap').innerHTML = `
  <div class="kpis">
    <div class="kpi${active?' alert':''}">
      <div class="kpi-l">${ico('siren',14)}활성 리콜</div>
      <div class="kpi-v" style="color:${active?'var(--bad)':'var(--ink)'}">${active}</div>
      <div class="kpi-s">${active?'즉시 처리 필요':'현재 이슈 없음'}</div></div>
    <div class="kpi">
      <div class="kpi-l">${ico('package',14)}등록된 사료</div>
      <div class="kpi-v">${pub}</div>
      <div class="kpi-s">임시저장 ${draft}건 포함</div></div>
    <div class="kpi">
      <div class="kpi-l">${ico('coins',14)}가격 레코드</div>
      <div class="kpi-v" style="color:var(--warn)">${priceN}</div>
      <div class="kpi-s">${noPrice}종 가격 미등록</div></div>
    <div class="kpi${unknown?'':' ok'}">
      <div class="kpi-l">${ico('microscope',14)}성분 사전</div>
      <div class="kpi-v" style="color:${unknown?'var(--warn)':'var(--good)'}">${store.ingredients.length}</div>
      <div class="kpi-s">${unknown?`미등록 원료 ${unknown}종`:'모든 원료 등록 완료'}</div></div>
  </div>
  <div class="grid2">
    <div class="card">
      <div class="sec-t">오늘 할 일</div>
      ${todos.map(t=>`<div class="todo"><span class="bul" style="background:${t.c}"></span>
        ${t.t}<a onclick="go('${t.go}')">${t.a}</a></div>`).join('')}
    </div>
    <div class="card">
      <div class="sec-t">최근 등록 사료</div>
      ${recent.map(f=>`<div class="rec-i">
        <div class="rec-ic">${hasThumb(f)?`<img src="${f.thumb}" alt="">`:ico(BS.deriveIco(f),16)}</div>
        <div style="min-width:0">
          <div class="rec-n">${esc(f.name)}</div>
          <div class="rec-m">${esc(f.brand)} · ${TYPE_KO[f.type]||f.type}</div>
        </div>
        <div class="rec-s" style="color:${f.score>=8?'var(--good)':f.score>=6?'var(--warn)':'var(--bad)'}">${f.score}</div>
      </div>`).join('')}
    </div>
  </div>`;
  el('alertbar').classList.toggle('on', active>0);
  if(active) el('alertTxt').textContent = `리콜 발생 — 즉시 처리 필요 (${active}건)`;
}

/* ═══ 사료 관리 ═══ */
let fQ='', fType='', fStatus='', fPage=1;
function pgFoods(){
  let list = store.foods;
  if(fQ) list = list.filter(f=>(f.brand+f.name).includes(fQ));
  if(fType) list = list.filter(f=>f.type===fType);
  if(fStatus) list = list.filter(f=>f.status===fStatus);
  const per=12, pages=Math.max(1,Math.ceil(list.length/per));
  fPage = Math.min(fPage, pages);
  const rows = list.slice((fPage-1)*per, fPage*per);

  el('wrap').innerHTML = `
  <div style="background:#16233D;border:1px solid #23386b;border-radius:8px;padding:12px 14px;
              margin-bottom:14px;font-size:12.5px;color:#9DBBF5;line-height:1.65;
              display:flex;align-items:center;gap:12px">
    <div style="flex:1">이 화면은 처음 열었을 때의 데이터를 브라우저에 복사해두고 그것만 보여줘요.
      그래서 <b>사료 관리(GitHub)에서 커밋한 내용이 여기엔 안 보여요.</b>
      여기서 고친 것도 브라우저에만 남고, 파일로 내려받아 직접 올려야 반영돼요.</div>
    <button class="btn" onclick="reloadFromFile()" style="flex-shrink:0">최신 데이터 불러오기</button>
    <a href="foods.html" style="flex-shrink:0;height:32px;padding:0 13px;border-radius:8px;background:#2F6FED;
       color:#fff;font-size:12.5px;font-weight:600;display:inline-flex;align-items:center">사료 관리 열기</a>
  </div>
  <div class="filters">
    <input class="inp fw" style="width:220px" placeholder="브랜드·사료명 검색" value="${at(fQ)}"
           oninput="fQ=this.value;fPage=1;ime(pgFoods)">
    <select class="inp fw" onchange="fType=this.value;fPage=1;pgFoods()">
      <option value="">전체 형태</option>${opts(TYPE_KO,fType)}</select>
    <select class="inp fw" onchange="fStatus=this.value;fPage=1;pgFoods()">
      <option value="">전체 상태</option>
      <option value="published"${fStatus==='published'?' selected':''}>발행</option>
      <option value="draft"${fStatus==='draft'?' selected':''}>임시저장</option></select>
    <div style="flex:1"></div>
    <button class="btn pri" onclick="newFood()">+ 사료 등록</button>
  </div>
  <div class="card" style="padding:0">
    ${rows.length ? `<table><thead><tr>
      <th style="width:34px"></th><th>사료명</th><th>형태</th><th>점수</th>
      <th>원료</th><th>가격</th><th>상태</th><th style="width:104px">관리</th>
    </tr></thead><tbody>
    ${rows.map(f=>{
      const warn = f.ingr.filter(i=>{const m=store.ingByName(i.name);return m&&m.safe!=='safe';}).length;
      return `<tr>
        <td>${hasThumb(f)?`<img src="${at(f.thumb)}" style="width:26px;height:26px;border-radius:6px;object-fit:cover;display:block">`:ico(BS.deriveIco(f),17)}</td>
        <td><div class="t-main">${esc(f.name)}</div>
            <div class="t-sub">${esc(f.brand)}${f.country?' · '+(COUNTRY_KO[f.country]||f.country):''}</div></td>
        <td><span class="tag mute">${TYPE_KO[f.type]||f.type}</span>${f.rx?' <span class="tag info">처방식</span>':''}</td>
        <td><b style="color:${f.score>=8?'var(--good)':f.score>=6?'var(--warn)':'var(--bad)'}">${f.score}</b></td>
        <td>${f.ingr.length}종${warn?` <span class="tag warn">주의 ${warn}</span>`:''}</td>
        <td>${f.prices.length?f.prices.length+'건':'<span class="tag warn">미등록</span>'}</td>
        <td><span class="tag ${f.status==='published'?'good':'mute'}">${f.status==='published'?'발행':'임시저장'}</span></td>
        <td><button class="btn sm" onclick="go('wizard','${f.id}')">수정</button>
            <button class="btn sm dan" onclick="delFood('${f.id}')">삭제</button></td>
      </tr>`}).join('')}
    </tbody></table>` : `<div class="empty">조건에 맞는 사료가 없어요</div>`}
  </div>
  ${pages>1?pager(fPage,pages,'fPage',list.length,'pgFoods'):''}`;
}
function pager(cur,pages,varName,total,fn){
  const btn=(p,l,d)=>`<button ${d?'disabled':''} class="${p===cur?'on':''}" onclick="${varName}=${p};${fn}()">${l||p}</button>`;
  let out=btn(cur-1,'‹',cur<=1);
  for(let p=1;p<=pages;p++) if(p===1||p===pages||Math.abs(p-cur)<=1) out+=btn(p);
    else if(Math.abs(p-cur)===2) out+='<button disabled>…</button>';
  out+=btn(cur+1,'›',cur>=pages);
  return `<div class="pager">${out}<span class="n">총 ${total}건</span></div>`;
}
function newFood(){ const f=store.newFood(); store.foods.unshift(f); save(); go('wizard',f.id); }
function delFood(id){
  const f=store.foodById(id); if(!f) return;
  if(!confirm(`'${f.name}' 사료를 삭제할까요?`)) return;
  store.foods = store.foods.filter(x=>x.id!==id); save(); pgFoods(); toast('삭제했어요');
}

/* ═══ 사료 위저드 ═══ */
let wF=null, wStep=1;
const STEPS=['기본 정보','영양성분','원료','점수 & 판단','가격 & 발행'];
function pgWizard(id){
  wF = store.foodById(id) || store.foods[0];
  if(!wF){ go('foods'); return; }
  el('pgTitle').textContent = wF.status==='draft' ? '사료 등록' : '사료 수정';
  wStep = 1; renderWizard();
}
function renderWizard(){
  el('wrap').innerHTML = `
  <div class="steps">${STEPS.map((s,i)=>{
    const n=i+1, cls=n===wStep?'on':n<wStep?'done':'';
    return `<div class="step ${cls}"><span class="step-n">${n<wStep?'✓':n}</span>${s}</div>`
      + (i<4?'<div class="step-line"></div>':'');
  }).join('')}</div>
  <div class="tabs">${STEPS.map((s,i)=>
    `<button class="${i+1===wStep?'on':''}" onclick="wGo(${i+1})">${i+1}. ${s}</button>`).join('')}</div>
  <div id="wBody"></div>`;
  [wS1,wS2,wS3,wS4,wS5][wStep-1]();
}
function wGo(n){ wStep=n; renderWizard(); }
function wFoot(last){
  return `<div class="wfoot">
    ${wStep>1?`<button class="btn" onclick="wGo(${wStep-1})">← 이전</button>`:''}
    <button class="btn" onclick="wSave()">임시저장</button>
    <div class="sp"></div>
    ${last ? `<button class="btn pri" onclick="wPublish()">발행하기</button>`
           : `<button class="btn pri" onclick="wGo(${wStep+1})">다음 단계 →</button>`}
  </div>`;
}
function wSave(){ save(); toast('임시저장했어요'); }

/* 이 어드민은 data.js 를 처음 한 번만 읽고 그 뒤로는 브라우저에 복사해둔 초안만 본다.
   그래서 사료 관리(GitHub) 화면에서 커밋한 내용이 여기엔 나타나지 않는다.
   이 버튼이 그 초안을 버리고 지금 파일의 값으로 다시 채운다. */
function reloadFromFile(){
  if(store.dirty && !confirm('이 화면에서 고친 내용은 사라지고, 파일에 있는 최신 값으로 다시 채워요. 계속할까요?')) return;
  store.discard();
  markDirty();
  pgFoods();
  toast('최신 데이터로 다시 불러왔어요');
}
function wPublish(){
  if(!wF.brand || !wF.name){ toast('브랜드와 사료명은 필수예요'); wGo(1); return; }
  wF.status='published'; wF.ico=BS.deriveIco(wF); save(); toast('발행했어요'); go('foods');
}
function set(path,v){
  const p=path.split('.'); let o=wF;
  for(let i=0;i<p.length-1;i++) o=o[p[i]];
  o[p[p.length-1]] = v;
}
function head(n,t){ return `<div class="wcard-h"><span class="n">Step ${n}/5</span><b>${t}</b></div>`; }

/* Step 1 — 기본 정보 */
function wS1(){
  el('wBody').innerHTML = `<div class="wcard">${head(1,'기본 정보')}
    <div class="row c2">
      <div class="fld"><label>브랜드 <i>*</i></label>
        <input class="inp" value="${at(wF.brand)}" placeholder="오리젠, 아카나 같이…"
               oninput="wF.brand=this.value;save()"></div>
      <div class="fld"><label>사료명 (한국어) <i>*</i></label>
        <input class="inp" value="${at(wF.name)}" placeholder="오리지널 독"
               oninput="wF.name=this.value;save()"></div>
    </div>
    <div class="fld"><label>사료 썸네일 <span>로고 또는 포장지 사진</span></label>
      <div class="thumbrow">
        <div class="thumbbox">${hasThumb(wF)
          ? `<img src="${at(wF.thumb)}" alt="">`
          : ico(BS.deriveIco(wF),30)}</div>
        <div style="flex:1;min-width:0">
          <input type="file" id="thumbFile" accept="image/jpeg,image/png,image/webp"
                 style="display:none" onchange="pickThumb(this)">
          <div style="display:flex;gap:7px">
            <button class="btn sm" onclick="el('thumbFile').click()">${ico('package',13)}사진 업로드</button>
            ${hasThumb(wF)?`<button class="btn sm dan" onclick="wF.thumb=null;save();wS1()">삭제</button>`:''}
          </div>
          <div class="hint">${hasThumb(wF)
            ? `업로드 완료 ${ico('check',11)} <b style="color:var(--good)">${thumbKB(wF.thumb)}KB</b> · 320px로 자동 압축돼요`
            : 'JPG·PNG·WebP, 최대 5MB · 320px로 자동 압축돼요'}</div>
        </div>
      </div>
      ${hasThumb(wF)?'':`<div class="hint" style="margin-top:6px">비워두면 주원료에 맞는 아이콘이 자동으로 쓰여요.</div>`}
    </div>
    <div class="fld"><label>처방식 여부</label>
      <div class="swrow"><label class="sw"><input type="checkbox" ${wF.rx?'checked':''}
        onchange="wF.rx=this.checked;save();renderWizard()"><i></i></label>
        <div><b>처방식 사료</b><p>수의사 처방이 필요한 사료예요. 앱 화면에 태그로 표시됩니다.</p></div></div></div>
    ${wF.rx?`<div class="fld"><label>처방식 안내 문구</label>
      <textarea class="inp" placeholder="간 질환·수술 후 회복기 아이를 위한 처방식이에요…"
        oninput="wF.rxInfo={vetGuidance:this.value};save()">${esc(wF.rxInfo?.vetGuidance||'')}</textarea></div>`:''}
    <div class="row c3">
      <div class="fld"><label>사료 형태 <i>*</i></label>
        <select class="inp" onchange="wF.type=this.value;save()">${opts(TYPE_KO,wF.type)}</select></div>
      <div class="fld"><label>생애단계 <i>*</i></label>
        <select class="inp" onchange="wF.ages=[this.value];save()">${opts(AGE_KO,wF.ages[0]||'all')}</select></div>
      <div class="fld"><label>원산지</label>
        <select class="inp" onchange="wF.country=this.value;save()">${opts(COUNTRY_KO,wF.country,'선택 안 함')}</select></div>
    </div>
    <div class="fld"><label>체형 <span>복수 선택</span></label>
      <div class="chips">${Object.entries(SIZE_KO).map(([k,v])=>
        `<button class="chip${wF.sizes.includes(k)?' on':''}" onclick="tglArr(wF.sizes,'${k}');renderWizard()">${v}</button>`).join('')}</div></div>
    ${wFoot()}</div>`;
}
function tglArr(arr,k){ const i=arr.indexOf(k); i>=0?arr.splice(i,1):arr.push(k); save(); }

/* 썸네일 — 서버가 없어 이미지를 data URL 로 보관한다.
   원본 크기 그대로 두면 용량이 감당이 안 되므로 320px·WebP 로 압축해서 저장한다. */
const THUMB_MAX = 320, THUMB_Q = 0.82;
function hasThumb(f){ return f.thumb && /^(data:|https?:)/.test(f.thumb); }
function thumbKB(u){ return Math.round((u.length*3/4)/1024); }
function pickThumb(input){
  const file = input.files && input.files[0];
  input.value = '';
  if(!file) return;
  if(!/^image\/(jpeg|png|webp)$/.test(file.type)){ toast('JPG·PNG·WebP만 올릴 수 있어요'); return; }
  if(file.size > 5*1024*1024){ toast('5MB 이하 파일만 올릴 수 있어요'); return; }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = ()=>{
    const s = Math.min(1, THUMB_MAX/Math.max(img.width, img.height));
    const w = Math.max(1,Math.round(img.width*s)), h = Math.max(1,Math.round(img.height*s));
    const c = document.createElement('canvas'); c.width=w; c.height=h;
    const cx = c.getContext('2d');
    cx.fillStyle = '#fff'; cx.fillRect(0,0,w,h);   // 투명 PNG 는 흰 배경으로
    cx.drawImage(img, 0, 0, w, h);
    let out = c.toDataURL('image/webp', THUMB_Q);
    if(out.indexOf('data:image/webp') !== 0) out = c.toDataURL('image/jpeg', 0.85);
    URL.revokeObjectURL(url);
    wF.thumb = out;
    if(save() === false){ wF.thumb = null; wS1(); return; }
    wS1();
    toast(`썸네일 등록했어요 (${thumbKB(out)}KB)`);
  };
  img.onerror = ()=>{ URL.revokeObjectURL(url); toast('이미지를 읽지 못했어요'); };
  img.src = url;
}

/* Step 2 — 영양성분 */
function wS2(){
  const n=wF.nutrient, est=estimateCarb(n);
  const f=(k,l,ph)=>`<div class="fld"><label>${l}</label>
    <input class="inp" type="number" step="0.1" value="${n[k]??''}" placeholder="${ph||''}"
      oninput="wF.nutrient.${k}=this.value===''?null:+this.value;save();wS2()"></div>`;
  el('wBody').innerHTML = `<div class="wcard">${head(2,'영양성분')}
    <div class="row c3">
      ${f('protein','조단백 최소값 (%)','38')}${f('fat','조지방 최소값 (%)','18')}${f('fiber','조섬유 최대값 (%)','5')}
    </div>
    <div class="row c3">
      ${f('moisture','수분 최대값 (%)','10')}${f('ash','조회분 최대값 (%)','7')}
      <div class="fld"><label>탄수화물 추정값 (%)</label>
        <input class="inp" value="${est}%" readonly style="color:var(--pri);font-weight:800">
        <div class="hint">${ico('bulb',11)} 위 값 입력 시 자동 계산돼요 (100 − 단백 − 지방 − 섬유 − 수분 − 회분)</div></div>
    </div>
    <div class="row c2">
      <div class="fld"><label>생육 함량 (%) <span>브랜드 공표값</span></label>
        <input class="inp" type="number" step="0.1" value="${n.meat??''}" placeholder="85"
          oninput="wF.nutrient.meat=this.value===''?null:+this.value;save()"></div>
      <div class="fld"><label>데이터 출처</label>
        <select class="inp" onchange="wF.nutrient.src=this.value;save()">
          ${opts({label:'라벨 직접 표기',brand:'브랜드 공식 자료',estimate:'추정값'},n.src||'label')}</select></div>
    </div>
    <div class="fld"><label>열량 (kcal/kg) <span>비우면 영양성분으로 추정</span></label>
      <input class="inp" type="number" value="${n.calKg??''}" placeholder="3590"
        oninput="wF.nutrient.calKg=this.value===''?null:+this.value;save()"></div>
    ${wFoot()}</div>`;
  wF.nutrient.carb = est;
}

/* Step 3 — 원료 + 소비자 요약 카드 */
function wS3(){
  const rows = wF.ingr.map((it,i)=>{
    const m = store.ingByName(it.name);
    const badge = m ? `<span class="tag ${m.safe==='safe'?'good':m.safe==='caution'?'warn':'bad'}">${SAFE_KO[m.safe]}</span>`
                    : `<span class="tag mute">미등록</span>`;
    return `<div class="irow">
      <div class="iarrows">
        <button onclick="moveIngr(${i},-1)" ${i===0?'disabled':''}>${ico('chevronRight',11)}</button>
        <button onclick="moveIngr(${i},1)" ${i===wF.ingr.length-1?'disabled':''}>${ico('chevronRight',11)}</button>
      </div>
      <div class="irank">${i+1}</div>
      <div class="iname">${esc(it.name)}</div>
      ${badge}
      <select class="inp" style="width:118px;padding:5px 22px 5px 8px;font-size:11px"
              onchange="wF.ingr[${i}].func=this.value;save()">
        <option value="">기능 없음</option>${opts(FUNC_KO,it.func)}</select>
      <button class="ix" onclick="wF.ingr.splice(${i},1);save();wS3()">${ico('ban',14)}</button>
    </div>`;
  }).join('');

  const vc = (kind,list) => list.map((c,i)=>`
    <div class="vcard ${kind}">
      <div class="vcard-h">
        <select onchange="moveVerdict('${kind}',${i},this.value)">
          <option value="pos"${kind==='pos'?' selected':''}>✅ 좋은 점</option>
          <option value="cau"${kind==='cau'?' selected':''}>⚠️ 주의할 점</option>
          <option value="bad"${kind==='bad'?' selected':''}>🚨 위험</option>
        </select><div class="sp"></div>
        <button class="ix" onclick="wF.verdict.${kind}.splice(${i},1);save();wS3()">${ico('ban',13)}</button>
      </div>
      <input class="inp" value="${at(c.title)}" placeholder="제목 — 짧고 명료하게"
             oninput="wF.verdict.${kind}[${i}].title=this.value;save()">
      <textarea class="inp" placeholder="소비자가 이해할 수 있는 언어로 설명해주세요"
        oninput="wF.verdict.${kind}[${i}].body=this.value;save()">${esc(c.body||'')}</textarea>
    </div>`).join('');

  el('wBody').innerHTML = `<div class="wcard">${head(3,'원료')}
    <div class="fld"><label>원료표 입력</label>
      <input class="inp" id="ingrPaste" placeholder="원료명 입력 후 Enter — 쉼표로 여러 개 한 번에"
             onkeydown="if(event.key==='Enter')addIngr(this)">
      <div class="hint">라벨에 표기된 순서 그대로 입력해주세요. 순서 = 함량 많은 순이에요.</div></div>
    ${rows || '<div class="empty" style="padding:26px">아직 등록된 원료가 없어요</div>'}
    <div class="fld" style="margin-top:20px">
      <label style="display:flex;align-items:center">소비자 요약 카드
        <button class="btn sm pri" style="margin-left:auto" onclick="autoVerdict()">✨ 자동 생성</button></label>
      <div class="hint" style="margin-bottom:10px">앱 상세화면에 표시되는 판정이에요. 원료표를 "우리 아이 언어"로 번역해주세요.</div>
      ${vc('pos',wF.verdict.pos)}${vc('cau',wF.verdict.cau)}${vc('bad',wF.verdict.bad)}
      <button class="btn" style="width:100%;justify-content:center" onclick="wF.verdict.pos.push({icon:'🥩',title:'',body:'',category:''});save();wS3()">+ 카드 추가</button>
      <div class="guide"><b>${ico('bulb',12)} 작성 가이드</b>
        원료 이야기가 아니라 <b>우리 아이 이야기</b>로 바꿔요<br>
        "닭고기가 1번 원료" → "진짜 고기가 주재료예요"<br>
        "BHA 无첨가" → "화학 방부제가 들어있어요, 발암 가능성이 연구되고 있어요"<br>
        카드는 최대 4개, 각 카드는 2~3줄이 적당해요</div>
    </div>
    ${wFoot()}</div>`;
}
function addIngr(inp){
  const names = inp.value.split(',').map(s=>s.trim()).filter(Boolean);
  for(const n of names) wF.ingr.push({name:n, func: store.ingByName(n)?.func || ''});
  inp.value=''; save(); wS3();
  setTimeout(()=>el('ingrPaste')?.focus(),0);
}
function moveIngr(i,d){
  const j=i+d; if(j<0||j>=wF.ingr.length) return;
  [wF.ingr[i],wF.ingr[j]]=[wF.ingr[j],wF.ingr[i]]; save(); wS3();
}
function moveVerdict(from,i,to){
  if(from===to) return;
  const c = wF.verdict[from].splice(i,1)[0];
  wF.verdict[to].push(c); save(); wS3();
}
function autoVerdict(){
  const n=wF.nutrient, added=[];
  const has = t => [...wF.verdict.pos,...wF.verdict.cau,...wF.verdict.bad].some(c=>c.title===t);
  const push=(k,icon,title,body)=>{ if(!has(title)){ wF.verdict[k].push({icon,title,body,category:'auto'}); added.push(title);} };
  if(n.meat>=70) push('pos','🥩','상위 원료 대부분이 동물성이에요',`생육 함량 약 ${n.meat}%`);
  if(n.protein>=30) push('pos','💪','단백질이 넉넉해요',`조단백 ${n.protein}%로 활동량 많은 아이에게도 충분해요.`);
  const bad = wF.ingr.filter(i=>store.ingByName(i.name)?.safe==='danger').map(i=>i.name);
  if(bad.length) push('bad','🚨','주의가 필요한 원료가 있어요',`${bad.join(', ')} — 상세 근거를 확인해주세요.`);
  const cau = wF.ingr.filter(i=>store.ingByName(i.name)?.safe==='caution').map(i=>i.name);
  if(cau.length) push('cau','⚠️','논쟁 중인 성분이 포함돼 있어요',`${cau.join(', ')} 등이 들어 있어요.`);
  if(n.carb>=40) push('cau','🌾','탄수화물이 많은 편이에요',`이 사료의 약 ${n.carb}%가 탄수화물이에요. 살이 찌기 쉬운 아이라면 주의하세요.`);
  save(); wS3(); toast(added.length?`${added.length}개 카드를 생성했어요`:'추가할 카드가 없어요');
}

/* Step 4 — 점수 & 판단 */
function wS4(){
  wF.score = totalScore(wF.ratings);
  const RL = {quality:'원료 품질', carb:'탄수화물', additive:'주의성분', value:'가성비'};
  const RC = {
    quality:{5:'동물성만 사용',4:'대부분 동물성',3:'보통 수준',2:'곡물 위주',1:'출처 불명'},
    carb:{5:'20% 미만',4:'20~30%',3:'30~40%',2:'40~50%',1:'50% 이상'},
    additive:{5:'주의성분 없음',4:'거의 없음',3:'논쟁 성분',2:'위험 1개',1:'위험 다수'},
    value:{5:'매우 저렴',4:'가성비 좋음',3:'보통',2:'비싼 편',1:'프리미엄'}};
  const stars = k => `<div class="stars">${[1,2,3,4,5].map(v=>
      `<button class="${v<=wF.ratings[k]?'on':''}" onclick="wF.ratings.${k}=${v};save();wS4()">${ico('star',18)}</button>`).join('')}
      <span class="lbl">${RC[k][wF.ratings[k]]||''}</span></div>`;
  const profRow = (arr,key) => Object.entries(CONCERN_KO).map(([k,v])=>
    `<button class="chip${arr.some(x=>x.concernType===k)?' on':''}" onclick="tglProf('${key}','${k}')">${v}</button>`).join('');
  const profInputs = (arr,key) => arr.map((p,i)=>`
    <div style="display:flex;gap:9px;align-items:center;margin-top:7px">
      <div style="width:104px;flex-shrink:0;font-size:11.5px;font-weight:700">${CONCERN_KO[p.concernType]||p.concernType}</div>
      <input class="inp" value="${at(p.label)}" placeholder="이 아이에게 왜 맞는지 한 줄로"
             oninput="wF.${key}[${i}].label=this.value;save()"></div>`).join('');

  el('wBody').innerHTML = `<div class="wcard">${head(4,'점수 & 판단')}
    <div class="scorebox">
      <div class="w">총점 (가중치: 품질 40% · 탄수화물 25% · 주의성분 25% · 가성비 10%)</div>
      <div class="v" style="color:${wF.score>=8?'var(--good)':wF.score>=6?'var(--warn)':'var(--bad)'}">${wF.score}</div>
    </div>
    <div class="row c2">${['quality','carb','additive','value'].map(k=>
      `<div class="fld"><label>${RL[k]}</label>${stars(k)}</div>`).join('')}</div>
    <div class="fld"><label>한줄평 <span>비우면 점수 기준으로 자동 생성</span></label>
      <input class="inp" value="${at(wF.headline||'')}" placeholder="${at(autoHeadline(wF))}"
             oninput="wF.headline=this.value||null;save()"></div>
    <div class="fld" style="margin-top:22px">
      <label style="color:var(--good)">✅ 이런 아이에게 잘 맞아요</label>
      <div class="chips">${profRow(wF.fit,'fit')}</div>
      ${profInputs(wF.fit,'fit')}</div>
    <div class="fld" style="margin-top:20px">
      <label style="color:var(--warn)">⚠️ 이런 경우 주의해요</label>
      <div class="chips">${profRow(wF.fitCaution,'fitCaution')}</div>
      ${profInputs(wF.fitCaution,'fitCaution')}</div>
    ${wFoot()}</div>`;
}
function tglProf(key,k){
  const arr=wF[key], i=arr.findIndex(x=>x.concernType===k);
  i>=0 ? arr.splice(i,1) : arr.push({concernType:k, label:''});
  save(); wS4();
}

/* Step 5 — 가격 & 발행 */
function wS5(){
  const rows = wF.prices.map((p,i)=>`
    <div class="irow" style="flex-wrap:wrap">
      <select class="inp" style="width:104px" onchange="wF.prices[${i}].shop=this.value;save()">${opts(SHOP_KO,p.shop)}</select>
      <input class="inp" style="width:88px" type="number" value="${p.wg??''}" placeholder="용량(g)"
             oninput="wF.prices[${i}].wg=+this.value;recalcPKg(${i})">
      <input class="inp" style="width:104px" type="number" value="${p.price??''}" placeholder="가격(원)"
             oninput="wF.prices[${i}].price=+this.value;recalcPKg(${i})">
      <div style="width:104px;font-size:11.5px;color:var(--sub);font-weight:700">
        ${p.pKg?Math.round(p.pKg).toLocaleString()+'원/kg':'—'}</div>
      <input class="inp" style="flex:1;min-width:150px" value="${at(p.url||'')}" placeholder="구매 링크 (쿠팡 상품 URL)"
             oninput="wF.prices[${i}].url=this.value||null;save()">
      <button class="ix" onclick="wF.prices.splice(${i},1);save();wS5()">${ico('ban',14)}</button>
    </div>`).join('');
  const wo = wF.weightOpts.map((o,i)=>`
    <div class="irow">
      <input class="inp" style="width:104px" type="number" value="${o.g??''}" placeholder="용량(g)"
             oninput="wF.weightOpts[${i}].g=+this.value;wF.weightOpts[${i}].label=fmtG(+this.value);save()">
      <div class="iname">${esc(o.label||'')}</div>
      <button class="ix" onclick="wF.weightOpts.splice(${i},1);save();wS5()">${ico('ban',14)}</button>
    </div>`).join('');

  el('wBody').innerHTML = `<div class="wcard">${head(5,'가격 & 발행')}
    <div class="fld"><label>봉지 용량 <span>급여량 계산기에서 선택지로 쓰여요</span></label>
      ${wo}<button class="btn sm" onclick="wF.weightOpts.push({g:2000,label:'2kg'});save();wS5()">+ 용량 추가</button></div>
    <div class="fld" style="margin-top:20px"><label>판매처별 가격</label>
      ${rows || '<div class="empty" style="padding:22px">등록된 가격이 없어요</div>'}
      <button class="btn sm" onclick="wF.prices.push({shop:'coupang',wg:null,price:null,pKg:null,url:null,avail:true});save();wS5()">+ 판매처 추가</button>
      <div class="hint">쿠팡 파트너스 제휴 링크를 넣으면 앱 구매 버튼에 연결돼요.</div></div>
    <div class="fld" style="margin-top:20px"><label>리콜 이력</label>
      <input class="inp" value="${at(wF.recall||'')}" placeholder="없으면 비워두세요"
             oninput="wF.recall=this.value||null;save()"></div>
    ${wFoot(true)}</div>`;
}
function fmtG(g){ return g>=1000 ? (g/1000)+'kg' : g+'g'; }
function recalcPKg(i){
  const p=wF.prices[i];
  p.pKg = (p.price && p.wg) ? Math.round(p.price/(p.wg/1000)) : null;
  save(); wS5();
}

/* ═══ 성분 관리 ═══ */
let iQ='', iSafe='', iCat='', iPage=1;
function pgIngr(){
  let list = store.ingredients;
  if(iQ) list = list.filter(i=>(i.name+i.nameEn).toLowerCase().includes(iQ.toLowerCase()));
  if(iSafe) list = list.filter(i=>i.safe===iSafe);
  if(iCat) list = list.filter(i=>i.cat===iCat);
  const per=12, pages=Math.max(1,Math.ceil(list.length/per));
  iPage=Math.min(iPage,pages);
  const rows=list.slice((iPage-1)*per, iPage*per);
  const unknown = store.unknownIngredients();

  el('wrap').innerHTML = `
  ${unknown.length?`<div class="card" style="margin-bottom:14px;border-color:#4A3A12;background:#17130A">
    <div style="display:flex;align-items:center;gap:9px">
      ${ico('alert',16)}<b style="font-size:12.5px">성분 사전에 없는 원료 ${unknown.length}종</b>
      <div style="flex:1"></div>
      <button class="btn sm pri" onclick="addAllUnknown()">일괄 등록</button></div>
    <div style="margin-top:9px;font-size:11.5px;color:var(--ink2);line-height:1.7">
      ${unknown.slice(0,14).map(u=>`${esc(u.name)}<span style="color:var(--muted)"> (${u.n})</span>`).join(' · ')}
      ${unknown.length>14?` 외 ${unknown.length-14}종`:''}</div></div>`:''}
  <div class="filters">
    <input class="inp fw" style="width:220px" placeholder="성분명 검색" value="${at(iQ)}"
           oninput="iQ=this.value;iPage=1;ime(pgIngr)">
    <select class="inp fw" onchange="iSafe=this.value;iPage=1;pgIngr()">
      <option value="">전체 등급</option>${opts(SAFE_KO,iSafe)}</select>
    <select class="inp fw" onchange="iCat=this.value;iPage=1;pgIngr()">
      <option value="">전체 카테고리</option>${opts(CATEGORY_KO,iCat)}</select>
    <div style="flex:1"></div>
    <button class="btn pri" onclick="openIngr()">+ 성분 등록</button>
  </div>
  <div class="card" style="padding:0">
    ${rows.length?`<table><thead><tr>
      <th>성분명</th><th>카테고리</th><th>안전 등급</th><th>알러젠</th><th>기능</th>
      <th>포함 사료</th><th style="width:104px">관리</th></tr></thead><tbody>
    ${rows.map(i=>`<tr>
      <td><div class="t-main">${esc(i.name)}</div>${i.nameEn?`<div class="t-sub">${esc(i.nameEn)}</div>`:''}</td>
      <td><span class="tag mute">${CATEGORY_KO[i.cat]||i.cat}</span></td>
      <td><span class="tag ${i.safe==='safe'?'good':i.safe==='caution'?'warn':'bad'}">${SAFE_KO[i.safe]}</span>
          ${i.basis?` <span title="${at(i.basis)}" style="color:var(--muted);cursor:help">ⓘ</span>`:''}</td>
      <td>${i.allergen?'<span class="tag warn">알러젠</span>':'<span style="color:var(--muted)">—</span>'}</td>
      <td>${i.func?`<span class="tag info">${FUNC_KO[i.func]}</span>`:'<span style="color:var(--muted)">—</span>'}</td>
      <td><span class="tag mute">${store.ingredientUsage(i.name)}</span></td>
      <td><button class="btn sm" onclick="openIngr('${i.id}')">수정</button>
          <button class="btn sm dan" onclick="delIngr('${i.id}')">삭제</button></td>
    </tr>`).join('')}</tbody></table>`:`<div class="empty">조건에 맞는 성분이 없어요</div>`}
  </div>
  ${pages>1?pager(iPage,pages,'iPage',list.length,'pgIngr'):''}`;
}
function addAllUnknown(){
  for(const u of store.unknownIngredients())
    store.ingredients.push({...store.newIngredient(), name:u.name, cat:'other', safe:'safe'});
  store.ingredients.sort((a,b)=>a.name.localeCompare(b.name,'ko'));
  save(); pgIngr(); toast('일괄 등록했어요 — 등급·설명을 채워주세요');
}
function delIngr(id){
  const g=store.ingredients.find(x=>x.id===id); if(!g) return;
  const used=store.ingredientUsage(g.name);
  if(used && !confirm(`'${g.name}'은 사료 ${used}종에서 쓰이고 있어요. 삭제할까요?`)) return;
  store.ingredients=store.ingredients.filter(x=>x.id!==id); save(); pgIngr(); toast('삭제했어요');
}

/* ═══ 맞춤찾기 태그 ═══ */
function pgTags(){
  const sec = (key,title,ico2,desc) => {
    const arr=store.tags[key];
    return `<div class="card" style="margin-bottom:14px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
        ${ico(ico2,16)}<b style="font-size:13.5px">${title}</b>
        <span style="font-size:10.5px;color:var(--muted)">${desc}</span></div>
      <table><thead><tr><th style="width:44px">순서</th><th>라벨 <span style="color:var(--muted)">(소비자에게 보이는 이름)</span></th>
        <th style="width:132px">아이콘 이름</th><th style="width:66px">노출</th></tr></thead><tbody>
      ${arr.map((t,i)=>`<tr>
        <td><div class="iarrows">
          <button onclick="moveTag('${key}',${i},-1)" ${i===0?'disabled':''}>${ico('chevronRight',11)}</button>
          <button onclick="moveTag('${key}',${i},1)" ${i===arr.length-1?'disabled':''}>${ico('chevronRight',11)}</button>
        </div></td>
        <td><input class="inp" value="${at(t.label)}" oninput="store.tags.${key}[${i}].label=this.value;save()">
            <div class="t-sub" style="margin-top:3px">key: ${t.key}</div></td>
        <td><input class="inp" value="${at(t.ico||'')}" placeholder="(선택)"
                   oninput="store.tags.${key}[${i}].ico=this.value;save()"></td>
        <td><label class="sw"><input type="checkbox" ${t.on?'checked':''}
              onchange="store.tags.${key}[${i}].on=this.checked;save()"><i></i></label></td>
      </tr>`).join('')}</tbody></table></div>`;
  };
  el('wrap').innerHTML = `
    <div class="card" style="margin-bottom:14px;border-color:var(--pri);background:var(--pri-soft)">
      <div style="font-size:11.5px;line-height:1.75;color:#9DBEFF">
        소비자 <b>맞춤찾기</b>(우리 아이를 알려주세요) 화면에 보이는 고민·나이·체형 옵션과
        아이콘·노출 순서를 관리해요. 옵션의 식별값(key)은 앱 코드와 연결돼 있어 수정할 수 없고,
        보이는 방식만 바꿀 수 있어요.</div></div>
    ${sec('concern','고민','soup','복수 선택 가능 · 앱 홈 칩에도 반영')}
    ${sec('age','나이','baby','단일 선택 나이 구간')}
    ${sec('size','체형','scale','단일 선택 체형(몸무게) 구간')}`;
}
function moveTag(key,i,d){
  const a=store.tags[key], j=i+d; if(j<0||j>=a.length) return;
  [a[i],a[j]]=[a[j],a[i]]; save(); pgTags();
}

/* ═══ 리콜 ═══ */
function pgRecall(){
  el('wrap').innerHTML = `
  <div class="filters"><div style="flex:1"></div>
    <button class="btn pri" onclick="openRecall()">🚨 리콜 등록</button></div>
  <div class="card" style="padding:0">
    ${store.recalls.length?`<table><thead><tr>
      <th>사료</th><th>심각도</th><th>사유</th><th>출처</th><th>등록일</th><th style="width:104px">관리</th>
    </tr></thead><tbody>${store.recalls.map((r,i)=>{
      const f=store.foodById(r.foodId);
      return `<tr>
        <td><div class="t-main">${esc(f?f.name:'—')}</div><div class="t-sub">${esc(f?f.brand:'')}</div></td>
        <td><span class="tag ${r.severity==='critical'?'bad':'warn'}">${r.severity==='critical'?'Critical':'Warning'}</span></td>
        <td><div class="t-sub" style="color:var(--ink2)">${esc(r.reason)}</div></td>
        <td>${esc(r.agency||'—')}</td><td>${r.date}</td>
        <td><button class="btn sm" onclick="toggleRecall(${i})">${r.active?'해제':'재활성'}</button>
            <button class="btn sm dan" onclick="delRecall(${i})">삭제</button></td>
      </tr>`}).join('')}</tbody></table>`:`<div class="empty">등록된 리콜이 없어요</div>`}
  </div>`;
}
function toggleRecall(i){
  const r=store.recalls[i]; r.active=!r.active;
  const f=store.foodById(r.foodId);
  if(f) f.recall = r.active ? r.reason : null;
  save(); pgRecall(); renderNav();
}
function delRecall(i){
  if(!confirm('리콜 기록을 삭제할까요?')) return;
  const r=store.recalls.splice(i,1)[0];
  const f=store.foodById(r.foodId); if(f) f.recall=null;
  save(); pgRecall(); renderNav();
}

/* ═══ 가격 관리 ═══ */
let pQ='', pOnly=false;
function pgPrice(){
  let list = store.foods;
  if(pQ) list = list.filter(f=>(f.brand+f.name).includes(pQ));
  if(pOnly) list = list.filter(f=>!f.prices.length);
  const noPrice = store.foods.filter(f=>!f.prices.length).length;
  const noLink  = store.foods.reduce((a,f)=>a+f.prices.filter(p=>!p.url).length,0);

  el('wrap').innerHTML = `
  <div class="kpis">
    <div class="kpi"><div class="kpi-l">${ico('coins',14)}가격 레코드</div>
      <div class="kpi-v">${store.foods.reduce((a,f)=>a+f.prices.length,0)}</div>
      <div class="kpi-s">전체 사료 ${store.foods.length}종</div></div>
    <div class="kpi${noPrice?' alert':' ok'}"><div class="kpi-l">${ico('alert',14)}가격 미등록</div>
      <div class="kpi-v" style="color:${noPrice?'var(--bad)':'var(--good)'}">${noPrice}</div>
      <div class="kpi-s">종</div></div>
    <div class="kpi"><div class="kpi-l">${ico('ban',14)}구매 링크 없음</div>
      <div class="kpi-v" style="color:${noLink?'var(--warn)':'var(--good)'}">${noLink}</div>
      <div class="kpi-s">제휴 링크 미연결 레코드</div></div>
  </div>
  <div class="filters">
    <input class="inp fw" style="width:220px" placeholder="브랜드·사료명 검색" value="${at(pQ)}"
           oninput="pQ=this.value;ime(pgPrice)">
    <button class="btn${pOnly?' pri':''}" onclick="pOnly=!pOnly;pgPrice()">미등록만 보기</button>
  </div>
  <div class="card" style="padding:0">
    ${list.length?`<table><thead><tr><th>사료</th><th>판매처</th><th>용량</th>
      <th>가격</th><th>kg당</th><th>링크</th><th style="width:70px"></th></tr></thead><tbody>
    ${list.flatMap(f => f.prices.length
      ? f.prices.map((p,pi)=>`<tr>
          <td><div class="t-main">${esc(f.name)}</div><div class="t-sub">${esc(f.brand)}</div></td>
          <td><span class="tag mute">${SHOP_KO[p.shop]||p.shop}</span></td>
          <td>${p.wg?fmtG(p.wg):'—'}</td>
          <td><b>${p.price?p.price.toLocaleString()+'원':'—'}</b></td>
          <td style="color:var(--sub)">${p.pKg?Math.round(p.pKg).toLocaleString()+'원':'—'}</td>
          <td>${p.url?`<span class="tag good">연결됨</span>`:`<span class="tag warn">없음</span>`}</td>
          <td><button class="btn sm" onclick="editPrices('${f.id}')">수정</button></td>
        </tr>`)
      : [`<tr><td><div class="t-main">${esc(f.name)}</div><div class="t-sub">${esc(f.brand)}</div></td>
          <td colspan="5"><span class="tag warn">가격 미등록</span></td>
          <td><button class="btn sm pri" onclick="editPrices('${f.id}')">등록</button></td></tr>`]
    ).join('')}</tbody></table>`:`<div class="empty">조건에 맞는 사료가 없어요</div>`}
  </div>`;
}
function editPrices(id){ wF=store.foodById(id); wStep=5; el('pgTitle').textContent='사료 수정'; page='wizard'; renderNav(); renderWizard(); }

/* ═══ 콘텐츠 ═══ */
function pgArticle(){
  el('wrap').innerHTML = `
  <div class="filters">
    <div style="font-size:11.5px;color:var(--muted);align-self:center">
      앱에 노출되는 콘텐츠(아티클)를 관리해요. 발행 상태인 글만 사용자에게 보여요.</div>
    <div style="flex:1"></div>
    <button class="btn pri" onclick="editArticle()">+ 콘텐츠 추가</button>
  </div>
  <div class="card" style="padding:0">
    ${store.articles.length?`<table><thead><tr>
      <th style="width:48px">순서</th><th>제목</th><th>분류</th><th>상태</th><th>수정일</th>
      <th style="width:104px">관리</th></tr></thead><tbody>
    ${store.articles.map((a,i)=>`<tr>
      <td><div class="iarrows">
        <button onclick="moveArticle(${i},-1)" ${i===0?'disabled':''}>${ico('chevronRight',11)}</button>
        <button onclick="moveArticle(${i},1)" ${i===store.articles.length-1?'disabled':''}>${ico('chevronRight',11)}</button>
      </div></td>
      <td><div class="t-main">${esc(a.title)}</div><div class="t-sub">${esc(a.excerpt)}</div></td>
      <td><span class="tag mute">${esc(a.cat)}</span></td>
      <td><span class="tag ${a.status==='published'?'good':'mute'}">${a.status==='published'?'발행':'임시저장'}</span></td>
      <td style="color:var(--sub)">${a.updated||'—'}</td>
      <td><button class="btn sm" onclick="editArticle('${a.id}')">수정</button>
          <button class="btn sm dan" onclick="delArticle('${a.id}')">삭제</button></td>
    </tr>`).join('')}</tbody></table>`:`<div class="empty">등록된 콘텐츠가 없어요</div>`}
  </div>`;
}
function moveArticle(i,d){
  const a=store.articles, j=i+d; if(j<0||j>=a.length) return;
  [a[i],a[j]]=[a[j],a[i]]; save(); pgArticle();
}
function delArticle(id){
  if(!confirm('콘텐츠를 삭제할까요?')) return;
  store.articles=store.articles.filter(a=>a.id!==id); save(); pgArticle(); toast('삭제했어요');
}

/* ═══ 리뷰 (원본 미구현) ═══ */
function pgReview(){
  el('wrap').innerHTML = `<div class="card"><div class="empty">
    ${ico('star',40)}<div style="margin-top:14px">리뷰 기능은 아직 준비 중이에요</div>
    <div style="margin-top:6px;font-size:11px">사용자 리뷰 수집이 시작되면 여기서 관리하게 됩니다.</div>
  </div></div>`;
}

/* ═══ MODALS ═══ */
function closeModal(){ el('ov').classList.remove('on'); el('ovBody').innerHTML=''; }
function showModal(html){ el('ovBody').innerHTML=html; el('ov').classList.add('on'); }

let mIng=null;
function openIngr(id){
  mIng = id ? clone(store.ingredients.find(i=>i.id===id)) : store.newIngredient();
  renderIngrModal();
}
function renderIngrModal(){
  const isNew = !store.ingredients.some(i=>i.id===mIng.id);
  showModal(`<div class="modal">
    <div class="modal-h"><b>${ico('microscope',17)}성분 ${isNew?'등록':'수정'}</b>
      <p>성분 마스터 데이터에 추가됩니다. 사료 원료 입력 시 자동으로 연결돼요.</p></div>
    <div class="row c2">
      <div class="fld"><label>성분명 (한국어) <i>*</i></label>
        <input class="inp" value="${at(mIng.name)}" placeholder="닭고기, BHA, 렌틸콩…"
               oninput="mIng.name=this.value"></div>
      <div class="fld"><label>성분명 (영어)</label>
        <input class="inp" value="${at(mIng.nameEn)}" placeholder="Chicken, BHA, Lentils…"
               oninput="mIng.nameEn=this.value"></div>
    </div>
    <div class="row c2">
      <div class="fld"><label>카테고리 <i>*</i></label>
        <select class="inp" onchange="mIng.cat=this.value">${opts(CATEGORY_KO,mIng.cat,'선택해주세요')}</select></div>
      <div class="fld"><label>안전 등급 <i>*</i></label>
        <div class="seg">${Object.entries(SAFE_KO).map(([k,v])=>
          `<button data-v="${k}" class="${mIng.safe===k?'on':''}" onclick="mIng.safe='${k}';renderIngrModal()">${v}</button>`).join('')}</div></div>
    </div>
    ${mIng.safe!=='safe'?`<div class="condbox">
      <div class="fld" style="margin-bottom:11px"><label>안전등급 근거 <i>*</i></label>
        <textarea class="inp" placeholder="왜 이 등급인지 소비자가 이해할 수 있게 적어주세요"
          oninput="mIng.basis=this.value">${esc(mIng.basis)}</textarea></div>
      <div class="fld" style="margin-bottom:0"><label>출처 URL</label>
        <input class="inp" value="${at(mIng.sourceUrl)}" placeholder="https://www.fda.gov/…"
               oninput="mIng.sourceUrl=this.value"></div></div>`:''}
    <div class="row c2" style="margin-top:15px">
      <div class="swrow"><label class="sw"><input type="checkbox" ${mIng.allergen?'checked':''}
        onchange="mIng.allergen=this.checked"><i></i></label>
        <div><b>알러젠 성분</b><p>알러지 유발 가능성 있음</p></div></div>
      <div class="swrow"><label class="sw"><input type="checkbox" ${mIng.func?'checked':''}
        onchange="mIng.func=this.checked?'eye_tear':'';renderIngrModal()"><i></i></label>
        <div><b>기능성 원료</b><p>눈물·관절 등 특정 기능</p></div></div>
    </div>
    ${mIng.func?`<div class="fld" style="margin-top:13px"><label>기능 종류</label>
      <select class="inp" onchange="mIng.func=this.value">${opts(FUNC_KO,mIng.func)}</select></div>`:''}
    <div class="fld" style="margin-top:13px"><label>성분 설명 <span>앱에 노출되는 설명</span></label>
      <textarea class="inp" placeholder="신선한 닭 근육육, 소화율 높고 단백질 공급원으로 우수"
        oninput="mIng.desc=this.value">${esc(mIng.desc)}</textarea></div>
    ${mIng.safe!=='safe'?`<div class="fld"><label>주의 문구 <span>앱 상세 화면 배지에 표시</span></label>
      <input class="inp" value="${at(mIng.warn)}" placeholder="영양 없는 충전재"
             oninput="mIng.warn=this.value"></div>`:''}
    <div class="modal-f">
      <button class="btn" onclick="closeModal()">취소</button>
      <button class="btn pri" onclick="saveIngr()">저장하기</button></div>
  </div>`);
}
function saveIngr(){
  if(!mIng.name || !mIng.cat){ toast('성분명과 카테고리는 필수예요'); return; }
  if(mIng.safe!=='safe' && !mIng.basis){ toast('주의·논쟁 등급은 근거가 필요해요'); return; }
  const i = store.ingredients.findIndex(x=>x.id===mIng.id);
  i>=0 ? store.ingredients[i]=mIng : store.ingredients.push(mIng);
  store.ingredients.sort((a,b)=>a.name.localeCompare(b.name,'ko'));
  save(); closeModal(); pgIngr(); toast('저장했어요');
}

let mRec=null;
function openRecall(){
  mRec = { foodId:'', severity:'critical', agency:'', url:'', reason:'', lot:'',
           date:new Date().toISOString().slice(0,10), active:true };
  showModal(`<div class="modal">
    <div class="modal-h"><b>🚨 리콜 등록</b>
      <p>농식품부 등 공식 기관의 리콜 정보를 등록해주세요. 등록 즉시 앱 상세화면에 표시됩니다.</p></div>
    <div class="fld"><label>연결할 사료 <i>*</i> <span>등록된 사료 중 선택</span></label>
      <select class="inp" onchange="mRec.foodId=this.value">
        <option value="">사료를 선택해주세요…</option>
        ${store.foods.map(f=>`<option value="${f.id}">${esc(f.brand)} ${esc(f.name)}</option>`).join('')}</select></div>
    <div class="row c2">
      <div class="fld"><label>심각도 <i>*</i></label>
        <select class="inp" onchange="mRec.severity=this.value">
          <option value="critical">🔴 Critical — 즉시 급여 중단</option>
          <option value="warning">🟡 Warning — 주의 필요</option></select></div>
      <div class="fld"><label>출처 기관 <i>*</i></label>
        <input class="inp" placeholder="농식품부, FDA, 브랜드사" oninput="mRec.agency=this.value"></div>
    </div>
    <div class="fld"><label>출처 URL</label>
      <input class="inp" placeholder="https://…" oninput="mRec.url=this.value"></div>
    <div class="fld"><label>리콜 사유 및 조치사항 <i>*</i></label>
      <textarea class="inp" placeholder="어떤 문제가 발견됐는지, 보호자가 어떻게 해야 하는지 적어주세요"
        oninput="mRec.reason=this.value"></textarea></div>
    <div class="fld"><label>영향 받는 제조번호 <span>선택</span></label>
      <input class="inp" placeholder="LOT 번호나 유통기한 범위" oninput="mRec.lot=this.value"></div>
    <div class="warnbox">
      등록 즉시 처리되는 항목<br>
      · 해당 사료 상세화면에 리콜 배너 표시<br>
      · 해당 사료 추천/비교에서 후순위 처리<br>
      · 대시보드 활성 리콜 카운트 +1</div>
    <div class="modal-f">
      <button class="btn" onclick="closeModal()">취소</button>
      <button class="btn pri" style="background:var(--bad);border-color:var(--bad)" onclick="saveRecall()">즉시 등록 & 알림 발송</button></div>
  </div>`);
}
function saveRecall(){
  if(!mRec.foodId || !mRec.agency || !mRec.reason){ toast('사료·출처 기관·사유는 필수예요'); return; }
  store.recalls.unshift(mRec);
  const f=store.foodById(mRec.foodId); if(f) f.recall = mRec.reason;
  save(); closeModal(); renderNav(); go('recall'); toast('리콜을 등록했어요');
}

let mArt=null;
function editArticle(id){
  mArt = id ? clone(store.articles.find(a=>a.id===id))
            : {id:uid(), cat:'건강 고민', ico:'book', title:'', excerpt:'', body:'',
               status:'draft', updated:new Date().toISOString().slice(0,10)};
  const cats=['성분 가이드','영양','건강 고민','사료 종류','생애주기','구매 팁'];
  showModal(`<div class="modal" style="max-width:720px">
    <div class="modal-h"><b>${ico('book',17)}콘텐츠 ${id?'수정':'작성'}</b>
      <p>가벼운 마크다운을 지원해요 — ### 소제목 · - 불릿 · 1. 번호 · &gt; 강조박스 · **굵게**</p></div>
    <div class="row c2">
      <div class="fld"><label>분류 <i>*</i></label>
        <select class="inp" onchange="mArt.cat=this.value">
          ${cats.map(c=>`<option ${c===mArt.cat?'selected':''}>${c}</option>`).join('')}</select></div>
      <div class="fld"><label>아이콘 이름</label>
        <input class="inp" value="${at(mArt.ico)}" oninput="mArt.ico=this.value"></div>
    </div>
    <div class="fld"><label>제목 <i>*</i></label>
      <input class="inp" value="${at(mArt.title)}" oninput="mArt.title=this.value"></div>
    <div class="fld"><label>요약 <span>목록 카드에 보여요</span></label>
      <textarea class="inp" oninput="mArt.excerpt=this.value">${esc(mArt.excerpt)}</textarea></div>
    <div class="fld"><label>본문 <i>*</i></label>
      <textarea class="inp" style="min-height:280px;font-family:ui-monospace,monospace;font-size:12px"
        oninput="mArt.body=this.value">${esc(mArt.body)}</textarea></div>
    <div class="modal-f">
      <button class="btn" onclick="closeModal()">취소</button>
      <button class="btn" onclick="saveArticle('draft')">임시저장</button>
      <button class="btn pri" onclick="saveArticle('published')">발행</button></div>
  </div>`);
}
function saveArticle(status){
  if(!mArt.title || !mArt.body){ toast('제목과 본문은 필수예요'); return; }
  mArt.status=status; mArt.updated=new Date().toISOString().slice(0,10);
  const i=store.articles.findIndex(a=>a.id===mArt.id);
  i>=0 ? store.articles[i]=mArt : store.articles.push(mArt);
  save(); closeModal(); pgArticle(); toast(status==='published'?'발행했어요':'임시저장했어요');
}

/* ═══ 내보내기 ═══ */
function openExport(){
  const pub=store.foods.filter(f=>f.status==='published').length;
  const draft=store.foods.length-pub;
  const artPub=store.articles.filter(a=>a.status==='published').length;
  showModal(`<div class="modal">
    <div class="modal-h"><b>${ico('package',17)}데이터 내보내기</b>
      <p>수정한 내용을 앱이 읽는 파일로 내려받아요. 받은 파일을 <code>balsatang/</code> 폴더에
         덮어쓰고 커밋하면 사이트에 반영됩니다.</p></div>
    <div class="card" style="background:var(--panel2);margin-bottom:14px">
      <div style="font-size:12px;line-height:2">
        발행 사료 <b>${pub}종</b>${draft?` <span style="color:var(--muted)">(임시저장 ${draft}종은 제외)</span>`:''}<br>
        썸네일 <b>${store.foods.filter(f=>f.thumb&&f.thumb.indexOf('data:')===0).length}장</b>
          <span style="color:var(--muted)">(${Math.round(store.thumbBytes()/1024)}KB)</span><br>
        성분 사전 <b>${store.ingredients.length}종</b><br>
        발행 콘텐츠 <b>${artPub}편</b></div></div>
    <div style="display:flex;gap:8px">
      <button class="btn pri" style="flex:1;justify-content:center" onclick="dl('data.js')">data.js 받기</button>
      <button class="btn pri" style="flex:1;justify-content:center" onclick="dl('articles.js')">articles.js 받기</button>
    </div>
    <div class="warnbox" style="background:var(--panel2);border-color:var(--line2);color:var(--sub)">
      브라우저에 저장된 임시 데이터는 이 기기에서만 보여요.
      다른 기기에서 이어서 작업하려면 파일을 내려받아 커밋해주세요.</div>
    <div class="modal-f">
      <button class="btn dan" onclick="resetDraft()">임시 데이터 초기화</button>
      <div style="flex:1"></div>
      <button class="btn" onclick="closeModal()">닫기</button></div>
  </div>`);
}
function dl(name){
  const text = name==='data.js' ? store.exportDataJs() : store.exportArticlesJs();
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([text],{type:'text/javascript'}));
  a.download=name; a.click(); URL.revokeObjectURL(a.href);
  toast(name+' 내려받았어요');
}
function resetDraft(){
  if(!confirm('브라우저에 저장된 수정 내용을 모두 버리고 원본으로 되돌릴까요?')) return;
  store.discard(); closeModal(); markDirty(); go('dash'); toast('원본으로 되돌렸어요');
}

/* ═══ INIT ═══ */
const mode = store.init();
renderNav(); markDirty(); go('dash');
if(mode==='draft') toast('이전에 작업하던 내용을 불러왔어요');
