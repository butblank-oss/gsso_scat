/**
 * 맬리 브레인 대상자 관리 ↔ Google 시트 연동 백엔드 (Option A: 시트=입력, 어드민=모니터링)
 *
 * 시트 탭 '대상자관리'는 사람이 읽고 편집하기 좋은 한글 헤더를 씁니다.
 * 이 스크립트가 한글 헤더 ↔ 어드민 대시보드 키를 자동 매핑합니다.
 *
 * 설정:
 *  1) 대상자 시트에서 확장 프로그램 → Apps Script.
 *  2) 이 코드를 전부 붙여넣고 저장.
 *  3) 배포 → 새 배포 → 웹 앱 / 실행: 나 / 액세스: 모든 사용자 → 배포 → URL 복사.
 *  4) 어드민 대상자 관리 탭 '☁ 시트' 칸에 URL 붙여넣기.
 *  5) (최초 1회) 어드민에서 [담당자 자동배분] → [💾 저장] 하면 배정된 명단이 시트로 전송됨.
 *  6) 직원 10명은 시트에서 '담당자' 열로 필터해 통화결과·핵심전환·1주후재접속·메모를 채움.
 *  7) 관리자는 어드민에서 [↓ 불러오기](또는 자동 새로고침)로 진도를 모니터링.
 */

var SHEET_NAME = '대상자관리';
// 어드민 키(key) ↔ 시트 한글 헤더(label)
var FIELDS = [
  { key: 'id',          label: 'id' },
  { key: 'name',        label: '이름' },
  { key: 'risk',        label: '위험도' },
  { key: 'dsl',         label: '미접속일' },
  { key: 'seg',         label: '세그먼트' },
  { key: 'owner',       label: '담당자' },
  { key: 'status',      label: '진행상태' },
  { key: 'call_result', label: '통화결과' },
  { key: 'conversion',  label: '핵심전환' },
  { key: 'reengaged',   label: '1주후재접속' },
  { key: 'memo',        label: '메모' },
  { key: 'updated_at',  label: '최종수정' }
];
var LABELS = FIELDS.map(function (f) { return f.label; });

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) { sh = ss.insertSheet(SHEET_NAME); sh.appendRow(LABELS); }
  return sh;
}
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** 어드민 "↓ 불러오기" — 시트 행을 어드민 키(JSON)로 반환 */
function doGet(e) {
  var sh = sheet_();
  var values = sh.getDataRange().getValues();
  var head = values.shift() || LABELS;
  // 시트 헤더(label) → 열 인덱스
  var colOf = {};
  head.forEach(function (h, i) { colOf[String(h).trim()] = i; });
  var rows = values
    .filter(function (r) { return String(r[colOf['id']] || '').trim() !== ''; })
    .map(function (r) {
      var o = {};
      FIELDS.forEach(function (f) {
        var i = colOf[f.label];
        o[f.key] = (i != null && r[i] != null) ? r[i] : '';
      });
      return o;
    });
  return json_({ ok: true, rows: rows });
}

/** 어드민 "💾 저장/전송" — 받은 rows(어드민 키)로 시트를 전체 교체(한글 헤더로 기록) */
function doPost(e) {
  var body = {};
  try { body = JSON.parse(e.postData.contents || '{}'); } catch (err) {}
  var rows = body.rows || [];
  var sh = sheet_();
  sh.clearContents();
  sh.appendRow(LABELS);
  if (rows.length) {
    var out = rows.map(function (r) {
      return FIELDS.map(function (f) { return r[f.key] != null ? r[f.key] : ''; });
    });
    sh.getRange(2, 1, out.length, LABELS.length).setValues(out);
  }
  return json_({ ok: true, count: rows.length, saved_at: new Date().toISOString() });
}
