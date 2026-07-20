// ============================================================
// Google Apps Script 웹앱 - 항공커미션 대시보드 Sheets 중계 서버
// ============================================================
// 배포 방법:
//   1. 대상 Google Sheet 열기 > 확장 프로그램 > Apps Script
//   2. 이 파일의 내용을 전체 붙여넣기 (기존 코드 대체)
//   3. 오른쪽 위 [배포] > [새 배포]
//      - 유형: 웹 앱
//      - 설명: airline-commissions v1
//      - 다음 사용자로 실행: 나(소유자)   ← 반드시 '나'
//      - 액세스 권한: 모든 사용자
//   4. 배포 후 나오는 웹앱 URL을 복사해서
//      index.html 상단 const GAS_URL = '...' 에 붙여넣기
// ============================================================

const SHEET_ID = '12qqW-NFFxbcvQa_whjoe2LRseCTVwWcLt07AvJzxcVs';
const GAS_SECRET = 'mrt-airline-comm-2026'; // index.html의 GAS_SECRET과 반드시 일치
const ALLOWED_DOMAINS = ['myrealtrip.com', 'aicx.kr'];
const ADMIN_EMAILS = ['haram.an@myrealtrip.com', 'sieon.choi@myrealtrip.com', 'hyerim.kim@myrealtrip.com'];

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    // 인증 체크
    if (data.secret !== GAS_SECRET) {
      return resp({ error: 'Unauthorized' });
    }
    if (!data.email || !ALLOWED_DOMAINS.some(function(d) { return data.email.endsWith('@' + d); })) {
      return resp({ error: 'Forbidden' });
    }

    const isAdminUser = ADMIN_EMAILS.indexOf(data.email) !== -1;
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const action = data.action;

    // 시트 이름 목록 조회 (모든 인증 사용자 가능)
    if (action === 'getSheetNames') {
      const names = ss.getSheets().map(function(s) { return s.getName(); });
      return resp({ names: names });
    }

    // 시트 데이터 전체 읽기 (모든 인증 사용자 가능)
    if (action === 'getValues') {
      const sheet = ss.getSheetByName(data.sheetName);
      if (!sheet) return resp({ error: 'Sheet not found', values: null });
      const lastRow = sheet.getLastRow();
      if (lastRow === 0) return resp({ values: [] });
      const lastCol = Math.max(sheet.getLastColumn(), 1);
      const values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
      // GAS 날짜 객체 등 직렬화 안전 처리
      const safeValues = values.map(function(row) {
        return row.map(function(cell) {
          return (cell === null || cell === undefined) ? '' : String(cell);
        });
      });
      return resp({ values: safeValues });
    }

    // 이하 쓰기 작업은 관리자만
    if (!isAdminUser) return resp({ error: 'Admin only' });

    // 새 시트 생성
    if (action === 'createSheet') {
      var existing = ss.getSheetByName(data.sheetName);
      if (existing) return resp({ created: false });
      ss.insertSheet(data.sheetName);
      return resp({ created: true });
    }

    // 특정 범위에 값 쓰기
    if (action === 'setValues') {
      const sheet = ss.getSheetByName(data.sheetName);
      if (!sheet) return resp({ error: 'Sheet not found' });
      if (!data.values || !data.values.length) return resp({ error: 'No values' });
      sheet.getRange(data.range).setValues(data.values);
      return resp({ success: true });
    }

    // 마지막 행 이후에 행 추가
    if (action === 'appendRows') {
      const sheet = ss.getSheetByName(data.sheetName);
      if (!sheet) return resp({ error: 'Sheet not found' });
      if (!data.values || !data.values.length) return resp({ error: 'No values' });
      const lastRow = sheet.getLastRow();
      sheet.getRange(lastRow + 1, 1, data.values.length, data.values[0].length).setValues(data.values);
      return resp({ success: true });
    }

    return resp({ error: 'Unknown action: ' + action });

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function resp(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
