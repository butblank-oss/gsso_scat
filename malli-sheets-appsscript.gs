/**
 * 맬리 브레인 대상자 관리 ↔ Google 시트 연동 백엔드
 *
 * 사용법(요약):
 *  1) Google 시트를 하나 만든다.
 *  2) 확장 프로그램 → Apps Script 를 열고 이 코드를 전부 붙여넣는다.
 *  3) 배포 → 새 배포 → 유형: 웹 앱 / 실행: 나 / 액세스: 모든 사용자 → 배포.
 *  4) 권한을 승인하고, 발급된 "웹 앱 URL"을 복사한다.
 *  5) 대시보드 대상자 관리 탭의 "☁ Google 시트" URL 칸에 붙여넣는다.
 *  6) "↑ 시트에 저장"으로 초기 데이터를 올리고, 이후 "↓ 불러오기"로 최신 상태를 공유한다.
 *
 * 저장 방식: POST가 오면 시트를 전체 교체(full replace)한다. 단일 작성자/최종 저장 우선.
 */

var SHEET_NAME = '대상자관리';
var HEADERS = ['id', 'name', 'risk', 'dsl', 'seg', 'owner', 'status',
               'call_result', 'conversion', 'reengaged', 'memo', 'updated_at'];

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(HEADERS);
  }
  return sh;
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** 대시보드 "↓ 불러오기" — 시트의 모든 행을 JSON으로 반환 */
function doGet(e) {
  var sh = sheet_();
  var values = sh.getDataRange().getValues();
  var head = values.shift() || HEADERS;
  var rows = values
    .filter(function (r) { return String(r[0] || '').trim() !== ''; })
    .map(function (r) {
      var o = {};
      head.forEach(function (h, i) { o[h] = r[i]; });
      return o;
    });
  return json_({ ok: true, rows: rows });
}

/** 대시보드 "↑ 시트에 저장" / 자동저장 — 받은 rows로 시트를 전체 교체 */
function doPost(e) {
  var body = {};
  try { body = JSON.parse(e.postData.contents || '{}'); } catch (err) {}
  var rows = body.rows || [];
  var sh = sheet_();
  sh.clearContents();
  sh.appendRow(HEADERS);
  if (rows.length) {
    var out = rows.map(function (r) {
      return HEADERS.map(function (h) { return r[h] != null ? r[h] : ''; });
    });
    sh.getRange(2, 1, out.length, HEADERS.length).setValues(out);
  }
  return json_({ ok: true, count: rows.length, saved_at: new Date().toISOString() });
}
