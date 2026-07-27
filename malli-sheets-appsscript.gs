/**
 * 맬리 브레인 TM 워크북 빌더 (Google Sheets 단독 운영 · Option A/3안)
 *
 * 하나의 스프레드시트 안에서 전부 처리합니다:
 *  - 담당자 10명에게 자동 배분(세그먼트 매트릭스 + 단기이탈 A/B 분할)
 *  - 담당자별 입력 탭 10개 자동 생성(대상자 + 통화기록 입력칸 + 드롭다운)
 *  - [현황판] 탭이 10개 탭을 통합해 세그먼트/담당자/A·B 진도 자동 집계
 *  - [스크립트] 탭에 세그먼트별 통화 대본
 *  - doGet: 어드민 대시보드가 원격 모니터링(통합 현황)할 수 있게 JSON 제공
 *
 * 사용법:
 *  1) '원본_명단' 탭(또는 첫 탭)에 대상자 명단이 있어야 함
 *     — 최소 열: id, 이름, 위험도, 미접속(일). (어드민에서 내보낸 CSV를 붙여넣으면 됨)
 *  2) 확장 프로그램 → Apps Script → 이 코드 전체 붙여넣기 → 저장.
 *  3) 시트로 돌아와 새로고침 → 상단 [맬리 TM] 메뉴 → [① 담당자 배분 + 10개 시트 생성].
 *  4) 이후 담당자는 본인 탭에서 입력, 관리자는 [② 현황판 새로고침]으로 집계.
 *  5) (선택) 배포 → 웹 앱으로 배포하면 어드민 대시보드에서 원격 모니터링 가능.
 */

var ROSTER_CANDIDATES = ['원본_명단', '대상자관리', '명단'];
var STAFF = ['김다희','김도영','김성정','김소리','김철순','노준성','박유라','안성호','윤종훈','이용혁'];
var SEG_ORDER = ['온보딩실패','이탈임박','단기이탈-A(리워드)','단기이탈-B(사용지원)','장기이탈'];
var MATRIX = {
  '온보딩실패':[11,10,10,10,10,10,10,10,10,10],
  '이탈임박':[3,3,3,3,2,2,2,2,2,2],
  '단기이탈-A(리워드)':[9,9,8,8,8,8,8,8,8,8],
  '단기이탈-B(사용지원)':[9,8,8,8,8,8,8,8,8,8],
  '장기이탈':[9,9,9,9,9,9,8,8,8,8]
};
var CALL_RESULTS = ['연결성공','부재중','결번·오류','거절'];
var CONVERSIONS  = ['첫콘텐츠실행완료','재사용시도함','재사용안함','리워드안내함','사용지원제공함','3기재등록동의','3기재등록거부','재통화예정','기타'];
var CONV_POSITIVE = ['첫콘텐츠실행완료','재사용시도함','리워드안내함','사용지원제공함','3기재등록동의'];
var REENGAGED = ['Y(재접속)','N(미재접속)','미확인'];
var STATUS = ['미착수','진행중','완료','제외'];
var TAB_HEAD = ['순번','id','이름','세그먼트','미접속일','통화일시','통화결과','핵심전환','1주후재접속','진행상태','메모'];

var SCRIPTS = {
  '온보딩실패': ['목적: 어디서 막혔는지 진단 + 즉시 설치지원 · 지표: 첫 콘텐츠 실행 전환율',
    'Q1. 맬리브레인 앱 설치는 되어있는데 아직 한 번도 안 켜신 것 같아 연락드렸어요. 지금 폰에 앱이 보이시나요?',
    'Q2. 켜보려다 안 되거나 어려운 부분이 있으셨나요?','Q3. 로그인/비밀번호에서 막히신 건 없으셨어요?',
    'Q4. 지금 저랑 같이 켜서 첫 게임까지 해보실 수 있을까요?','Q5. (실패 시) 다시 도와드릴 시간, 언제가 편하실까요?'],
  '이탈임박': ['목적: 가벼운 습관 복귀(안부콜) · 지표: 통화 중 재사용 시도',
    'Q1. 요즘 잘 지내세요? 며칠 안 쓰신 것 같아 안부차 연락드렸어요.',
    'Q2. 바쁘셨거나 불편한 점이 있으셨나요?','Q3. 오늘 잠깐 한 게임만 같이 해보실래요?'],
  '단기이탈-A(리워드)': ['목적: A/B A조(리워드) · 지표: 1주 후 재접속률',
    'Q1. 한동안 안 쓰신 듯해 연락드렸어요. 어떤 이유로 뜸해지셨어요?',
    'Q2. 특별히 지루하거나 어려웠던 게임이 있으셨어요? (필수)','Q3. 다시 쓰신다면 어떤 점이 도움이 될까요?',
    'Q4. 다시 시작하시는 분께 영양제를 선물로 드려요, 관심 있으실까요?','Q5. 이번 주 안에 한 번 다시 켜보실 수 있을까요?'],
  '단기이탈-B(사용지원)': ['목적: A/B B조(리워드 없음) · 지표: 1주 후 재접속률',
    'Q1. 한동안 안 쓰신 듯해 연락드렸어요. 어떤 이유로 뜸해지셨어요?',
    'Q2. 특별히 지루하거나 어려웠던 게임이 있으셨어요? (필수)','Q3. 다시 쓰신다면 어떤 점이 도움이 될까요?',
    'Q4. 사용법을 다시 간단히 안내해드려도 될까요?','Q5. 이번 주 안에 한 번 다시 켜보실 수 있을까요?'],
  '장기이탈': ['목적: 저비용, 다음 기수 안내 · 지표: 3기 재등록 동의율',
    'Q1. 오랜만이에요. 맬리브레인 다시 참여하고 싶으신 마음 있으실까요?',
    'Q2. 다음 기수(3기) 모집 때 다시 안내드려도 될까요?','Q3. 이용하시며 불편했던 점 있으셨다면 간단히 말씀해주실 수 있을까요?']
};

function onOpen() {
  SpreadsheetApp.getUi().createMenu('맬리 TM')
    .addItem('① 담당자별 시트 생성/갱신 (담당자 열 기준)', 'buildWorkbook')
    .addItem('② 현황판 새로고침', 'refreshDashboard')
    .addToUi();
}

/* ---------- 명단 읽기 ---------- */
function findRosterSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  for (var i = 0; i < ROSTER_CANDIDATES.length; i++) {
    var s = ss.getSheetByName(ROSTER_CANDIDATES[i]);
    if (s) return s;
  }
  return ss.getSheets()[0];
}
function colIndex_(head, keywords) {
  for (var i = 0; i < head.length; i++) {
    var h = String(head[i]).trim().toLowerCase();
    for (var k = 0; k < keywords.length; k++) if (h.indexOf(keywords[k]) >= 0) return i;
  }
  return -1;
}
function readRoster_() {
  var sh = findRosterSheet_();
  var vals = sh.getDataRange().getValues();
  var head = vals.shift() || [];
  var ci = {
    id: colIndex_(head, ['id']),
    name: colIndex_(head, ['이름','name']),
    risk: colIndex_(head, ['위험도','risk']),
    dsl: colIndex_(head, ['미접속','dsl']),
    owner: colIndex_(head, ['담당자','owner']),
    seg: colIndex_(head, ['세그먼트','seg']),
    status: colIndex_(head, ['진행상태','상태','status'])
  };
  if (ci.id < 0 || ci.risk < 0) throw new Error("'원본_명단' 탭에 id/위험도 열이 필요합니다. 어드민 CSV를 붙여넣어 주세요.");
  var rows = [];
  vals.forEach(function (r) {
    var id = String(r[ci.id] || '').trim(); if (!id) return;
    rows.push({ id: id, name: ci.name >= 0 ? r[ci.name] : '', risk: String(r[ci.risk] || '').trim(),
      dsl: ci.dsl >= 0 ? Number(r[ci.dsl]) || 0 : 0,
      owner: ci.owner >= 0 ? String(r[ci.owner] || '').trim() : '',
      seg: ci.seg >= 0 ? String(r[ci.seg] || '').trim() : '',
      status: ci.status >= 0 ? String(r[ci.status] || '').trim() : '' });
  });
  return rows;
}

/* ---------- 배분 ---------- */
function computeAssignment_(roster) {
  // 제외: 진행상태가 '제외'인 사람과 위험도가 '유지'인 사람은 배정 대상에서 뺀다
  var pool = roster.filter(function (r) { return r.status !== '제외' && r.risk !== '유지'; });
  var cmp = function (a, b) { return a.dsl - b.dsl || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0); };
  var pick = function (risk) { return pool.filter(function (r) { return r.risk === risk; }).sort(cmp); };
  var short = pick('단기이탈');
  var A = short.filter(function (_, i) { return i % 2 === 0; });
  var B = short.filter(function (_, i) { return i % 2 === 1; });
  var buckets = {
    '온보딩실패': pick('온보딩실패'), '이탈임박': pick('이탈임박'),
    '단기이탈-A(리워드)': A, '단기이탈-B(사용지원)': B, '장기이탈': pick('장기이탈')
  };
  // staff -> list of {row, seg}
  var byStaff = {}; STAFF.forEach(function (s) { byStaff[s] = []; });
  SEG_ORDER.forEach(function (seg) {
    var list = buckets[seg] || [], cnt = MATRIX[seg], idx = 0;
    cnt.forEach(function (n, si) {
      for (var k = 0; k < n && idx < list.length; k++) { byStaff[STAFF[si]].push({ row: list[idx], seg: seg }); idx++; }
    });
  });
  return byStaff;
}

/* ---------- 워크북 생성 ---------- */
function sheetReset_(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (sh) sh.clear(); else sh = ss.insertSheet(name);
  return sh;
}
function dv_(list) {
  return SpreadsheetApp.newDataValidation().requireValueInList(list, true).setAllowInvalid(true).build();
}
// 담당자별 그룹 만들기: 원본_명단에 담당자 열이 있으면 그 값으로 분리(어드민 배분 존중),
// 없으면 매트릭스로 자동배분(fallback).
function groupByOwner_(roster) {
  var hasOwner = roster.some(function (r) { return r.owner; });
  var groups = {};
  if (hasOwner) {
    roster.forEach(function (r) {
      if (r.status === '제외' || r.risk === '유지') return;   // 제외 대상 스킵
      var o = (r.owner || '').trim(); if (!o) return;         // 미배정 스킵
      (groups[o] = groups[o] || []).push({ row: r, seg: r.seg || r.risk });
    });
  } else {
    groups = computeAssignment_(roster);                       // {담당자: [{row,seg}]}
  }
  return groups;
}
function buildWorkbook() {
  var roster = readRoster_();
  var groups = groupByOwner_(roster);
  var owners = Object.keys(groups).filter(function (o) { return groups[o] && groups[o].length; }).sort();
  if (!owners.length) { SpreadsheetApp.getUi().alert("배정된 대상자가 없습니다. '원본_명단'에 담당자 열이 채워져 있는지 확인하세요."); return; }
  buildScriptTab_();
  owners.forEach(function (owner) {
    var sh = sheetReset_('담당자_' + owner);
    sh.getRange(1, 1).setValue('담당자: ' + owner + '  ·  회색 칸=입력  ·  통화일시/결과/전환/재접속/진행상태/메모');
    sh.getRange(1, 1, 1, TAB_HEAD.length).merge().setFontWeight('bold').setBackground('#EAF3F2');
    sh.getRange(2, 1, 1, TAB_HEAD.length).setValues([TAB_HEAD]).setFontWeight('bold').setBackground('#F2F0E9');
    var items = groups[owner];
    var data = items.map(function (it, i) {
      return [i + 1, it.row.id, it.row.name, it.seg, it.row.dsl, '', '', '', '', (it.row.status || '미착수'), (it.row.memo || '')];
    });
    sh.getRange(3, 1, data.length, TAB_HEAD.length).setValues(data);
    var n = data.length;
    sh.getRange(3, 7, n).setDataValidation(dv_(CALL_RESULTS));   // 통화결과
    sh.getRange(3, 8, n).setDataValidation(dv_(CONVERSIONS));    // 핵심전환
    sh.getRange(3, 9, n).setDataValidation(dv_(REENGAGED));      // 1주후재접속
    sh.getRange(3, 10, n).setDataValidation(dv_(STATUS));        // 진행상태
    sh.setFrozenRows(2);
    sh.setColumnWidth(2, 60); sh.setColumnWidth(3, 70); sh.setColumnWidth(4, 130); sh.setColumnWidth(11, 220);
  });
  refreshDashboard();
  SpreadsheetApp.getUi().alert('완료 — 담당자 ' + owners.length + '개 시트 생성 + 현황판 집계.\n담당자: ' + owners.join(', ') + '\n각 담당자 탭에서 입력하고, 집계는 [맬리 TM → ② 현황판 새로고침].');
}
function buildScriptTab_() {
  var sh = sheetReset_('스크립트');
  var out = [['세그먼트별 통화 스크립트']];
  SEG_ORDER.forEach(function (seg) {
    out.push(['']); out.push(['▶ ' + seg]);
    (SCRIPTS[seg] || []).forEach(function (line) { out.push([line]); });
  });
  sh.getRange(1, 1, out.length, 1).setValues(out);
  sh.getRange(1, 1).setFontWeight('bold').setFontSize(13);
  sh.setColumnWidth(1, 720);
}

/* ---------- 통합 현황판 ---------- */
function collectAll_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), all = [];
  ss.getSheets().forEach(function (sh) {
    var nm = sh.getName(); if (nm.indexOf('담당자_') !== 0) return;
    var staff = nm.substring('담당자_'.length);
    var vals = sh.getDataRange().getValues();
    for (var i = 2; i < vals.length; i++) {           // row3~ (0-based 2)
      var r = vals[i]; if (!String(r[1] || '').trim()) continue; // id
      all.push({ owner: staff, id: r[1], name: r[2], seg: r[3], dsl: r[4],
        call_time: r[5], call_result: r[6], conversion: r[7], reengaged: r[8], status: r[9], memo: r[10] });
    }
  });
  return all;
}
function pctStr_(a, b) { return (b ? Math.round(1000 * a / b) / 10 : 0) + '%'; }
function refreshDashboard() {
  var all = collectAll_();
  var sh = sheetReset_('현황판');
  var tried = function (x) { return x.call_result && String(x.call_result).trim() !== ''; };
  var conn = function (x) { return x.call_result === '연결성공'; };
  var conv = function (x) { return CONV_POSITIVE.indexOf(String(x.conversion)) >= 0; };
  var reY = function (x) { return String(x.reengaged || '').indexOf('Y') === 0; };
  var rows = [['세그먼트별 진도 (자동 집계)'], ['세그먼트','배정','시도','연결','전환','연결률']];
  SEG_ORDER.forEach(function (seg) {
    var g = all.filter(function (x) { return x.seg === seg; });
    var t = g.filter(tried).length, c = g.filter(conn).length, v = g.filter(conv).length;
    rows.push([seg, g.length, t, c, v, pctStr_(c, t)]);
  });
  rows.push(['']);
  rows.push(['A/B 비교 (단기이탈 · 1주후 재접속률)']); rows.push(['조','시도','재접속Y','재접속률']);
  ['단기이탈-A(리워드)','단기이탈-B(사용지원)'].forEach(function (seg) {
    var g = all.filter(function (x) { return x.seg === seg; });
    var t = g.filter(tried).length, y = g.filter(reY).length;
    rows.push([seg, t, y, pctStr_(y, t)]);
  });
  rows.push(['']);
  rows.push(['담당자별 진도 (자동 집계)']); rows.push(['담당자','배정','시도','연결','진행률','전환']);
  var owners = []; all.forEach(function (x) { if (owners.indexOf(x.owner) < 0) owners.push(x.owner); });
  owners.sort();
  owners.forEach(function (staff) {
    var g = all.filter(function (x) { return x.owner === staff; });
    var t = g.filter(tried).length, c = g.filter(conn).length, v = g.filter(conv).length;
    rows.push([staff, g.length, t, c, pctStr_(t, g.length), v]);
  });
  sh.getRange(1, 1, rows.length, 6).setValues(rows.map(function (r) { while (r.length < 6) r.push(''); return r; }));
  sh.getRange(1, 1).setFontWeight('bold');
  sh.getRange('A1').setBackground('#EAF3F2');
  sh.setColumnWidth(1, 170);
  sh.setFrozenRows(1);
}

/* ---------- 어드민 원격 모니터링(선택) ---------- */
function doGet(e) {
  var all = collectAll_();
  var rows = all.map(function (x) {
    return { id: x.id, name: x.name, seg: x.seg, dsl: x.dsl, owner: x.owner, status: x.status,
      call_result: x.call_result, conversion: x.conversion, reengaged: x.reengaged, memo: x.memo, updated_at: x.call_time };
  });
  return ContentService.createTextOutput(JSON.stringify({ ok: true, rows: rows }))
    .setMimeType(ContentService.MimeType.JSON);
}
