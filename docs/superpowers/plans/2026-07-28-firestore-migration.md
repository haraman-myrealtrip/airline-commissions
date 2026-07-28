# Firestore 이전 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 커미션 대시보드의 데이터 저장소를 구글시트 직접 read/write에서 Firebase Firestore로 이전해, 쓰기 실패(403/토큰만료)·렌더 착시·읽기 지연을 근본 제거한다.

**Architecture:** GitHub Pages 정적 단일 파일(`index.html`) 구조 유지. Firebase **compat SDK**(CDN `<script>`, 빌드/모듈 불필요)로 기존 인라인 스크립트에 최소 침습적으로 붙인다. 읽기는 `onSnapshot` 실시간 구독, 쓰기는 `set/add`, 인증은 Firebase Auth(Google), 접근제어는 Firestore 보안규칙으로 서버에서 강제. 현재 하드코딩 배열(`loadEmbeddedData`)이 권위 데이터이므로 이를 일회성 seed로 Firestore에 적재.

**Tech Stack:** HTML/CSS/vanilla JS (인라인, 빌드 없음), Firebase compat SDK v10 (Auth + Firestore), GitHub Pages, Google Drive(이미지, 현행 유지).

## Global Constraints

- **빌드 도구 도입 금지** — 단일 `index.html` 인라인 구조 유지. Firebase는 compat CDN `<script>`로만 로드.
- **유료 기능 금지** — Cloud Functions·Firebase Storage 사용 안 함(무료 Spark 유지). 이미지는 구글 드라이브 링크 유지.
- **관리자 목록**: `haram.an@myrealtrip.com`, `sieon.choi@myrealtrip.com`, `hyerim.kim@myrealtrip.com`. 추후 추가는 두 곳(`ADMIN_EMAILS` 상수 + 보안규칙 목록)만 수정.
- **허용 도메인**: `myrealtrip.com`, `aicx.kr`.
- **권위 데이터 원본**: `index.html`의 `loadEmbeddedData()` 하드코딩 배열(`airlines[]`, `historyData[]`). 시트(`1pmVuY...`)는 낡음 — seed 원본으로 쓰지 않음.
- **배포 게이트**: 모든 작업은 `firestore-migration` 브랜치. `main` 병합/push(=프로덕션 배포)는 사용자 명시 승인 시에만.
- **커밋**: 각 태스크 끝에서 `firestore-migration` 브랜치에 커밋(로컬). push는 하지 않음.

---

## 파일 구조

- **Modify:** `index.html` — 인증·읽기·쓰기 계층 교체(기존 GIS/Sheets 코드 제거, Firebase 코드 추가). UI/렌더 함수(`renderStats`, `renderCards`, `loadAdminAirline` 등)는 유지.
- **Create:** `firestore.rules` — 보안규칙 원본(콘솔에 붙여넣어 배포, 저장소엔 기록용으로 보관).
- **Create:** `docs/superpowers/plans/2026-07-28-firestore-migration.md` — 본 문서.
- **Modify:** `README.md` — 데이터 흐름·권한 구조 섹션을 Firestore 기준으로 갱신.
- **정리 대상(선택):** `gas-webapp.js`(방치), `commission.html`(고아) — Task 8에서 삭제.

---

## Task 1: Firebase 프로젝트 준비 (사람이 수행 · 블로킹 선행)

Claude가 대신 못 하는 콘솔 작업. 완료 후 config를 Claude에 전달해야 이후 태스크 진행 가능.

**Files:** 없음(외부 콘솔 작업). 산출물 = firebaseConfig 객체.

- [ ] **Step 1: 프로젝트 생성** — https://console.firebase.google.com 접속(편집권한 있는 구글계정) → "프로젝트 추가" → 이름 예: `airline-commissions` → Google Analytics는 **사용 안 함** 선택 → 생성.

- [ ] **Step 2: Firestore 활성화** — 좌측 "빌드 → Firestore Database" → "데이터베이스 만들기" → 위치 `asia-northeast3(서울)` → **프로덕션 모드**로 시작(규칙은 Task 3에서 교체).

- [ ] **Step 3: Google 로그인 활성화** — 좌측 "빌드 → Authentication" → "시작하기" → Sign-in method 탭 → **Google** 사용 설정 → 저장.

- [ ] **Step 4: 승인된 도메인 추가** — Authentication → Settings → "승인된 도메인"에 `haraman-myrealtrip.github.io` 추가. (`localhost`는 기본 포함되어 로컬 테스트 가능.)

- [ ] **Step 5: 웹 앱 등록 + config 확보** — 프로젝트 설정(⚙️) → "내 앱" → 웹(`</>`) 추가 → 앱 닉네임 입력 → 등록 → 표시되는 `firebaseConfig` 객체(apiKey, authDomain, projectId, appId 등) 복사. **이 값들은 공개돼도 무방**(보안은 규칙이 담당).

- [ ] **Step 6: config를 Claude에 전달** — 위 `firebaseConfig` 전체를 채팅에 붙여넣기. 이후 태스크가 이 값을 `index.html`에 배선.

**Deliverable:** Firestore·Google 로그인 활성화된 Firebase 프로젝트 + 전달된 firebaseConfig + 승인 도메인 등록 완료.

---

## Task 2: Firebase SDK 로드 + 초기화 배선

`index.html`에 compat SDK를 붙이고 `db`/`auth` 핸들을 만든다. 아직 기존 GIS/Sheets 코드는 건드리지 않음(공존 상태에서 초기화만 확인).

**Files:**
- Modify: `index.html:7`(head script 영역), `index.html:335-350`(스크립트 상단 상수 영역)

**Interfaces:**
- Produces: 전역 `db`(=`firebase.firestore()`), `auth`(=`firebase.auth()`) — Task 4~7이 사용.

- [ ] **Step 1: compat SDK 스크립트 추가** — `index.html` `<head>`의 GSI 스크립트(`index.html:7`) 아래에 삽입:

```html
<script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js"></script>
```

- [ ] **Step 2: 초기화 코드 추가** — 인라인 `<script>`(`index.html:335`) 최상단에, Task 1에서 받은 config로:

```js
const firebaseConfig = {
  apiKey: "<전달받은 값>",
  authDomain: "<전달받은 값>",
  projectId: "<전달받은 값>",
  appId: "<전달받은 값>"
  // (messagingSenderId, storageBucket 등 받은 값 그대로 포함)
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();
```

- [ ] **Step 3: 로컬 서버로 로드 검증** — `preview_start`로 저장소 루트를 정적 서빙(예: 로컬 http 서버) → 브라우저 콘솔에서 `firebase.apps.length` 가 `1`, `typeof db.collection === 'function'` 가 `true` 인지 확인.

- [ ] **Step 4: 콘솔 에러 없음 확인** — `read_console_messages`로 Firebase 초기화 관련 에러가 없는지 확인(빨간 에러 0건).

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat(firebase): compat SDK 로드 및 db/auth 초기화 배선"
```

---

## Task 3: Firestore 보안규칙 작성 + 배포

읽기=허용도메인, 쓰기=관리자만. 서버 측 강제.

**Files:**
- Create: `firestore.rules`

- [ ] **Step 1: 규칙 파일 작성** — `firestore.rules`:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isAllowedDomain() {
      return request.auth != null &&
        request.auth.token.email.matches('.*@(myrealtrip[.]com|aicx[.]kr)$');
    }
    function isAdmin() {
      return request.auth != null && request.auth.token.email in [
        'haram.an@myrealtrip.com',
        'sieon.choi@myrealtrip.com',
        'hyerim.kim@myrealtrip.com'
      ];
    }
    match /{document=**} {
      allow read: if isAllowedDomain();
      allow write: if isAdmin();
    }
  }
}
```

- [ ] **Step 2: 콘솔에 배포** — Firebase 콘솔 → Firestore Database → "규칙" 탭 → 위 내용 붙여넣기 → **게시(Publish)**.

- [ ] **Step 3: 규칙 시뮬레이터 검증** — 콘솔 규칙 시뮬레이터에서:
  - `read`, 인증 이메일 `test@myrealtrip.com` → **허용**
  - `read`, 인증 이메일 `test@gmail.com` → **거부**
  - `write`(`airlines/AA`), 인증 이메일 `hyerim.kim@myrealtrip.com` → **허용**
  - `write`(`airlines/AA`), 인증 이메일 `notadmin@myrealtrip.com` → **거부**

- [ ] **Step 4: Commit**

```bash
git add firestore.rules
git commit -m "feat(firestore): 보안규칙 - 읽기는 허용도메인, 쓰기는 관리자만"
```

---

## Task 4: 인증 교체 (GIS → Firebase Auth)

로그인/로그아웃/관리자 판정을 Firebase Auth로 교체. 도메인·관리자 게이팅은 동일 로직 유지.

**Files:**
- Modify: `index.html:356-408`(GIS 초기화·콜백·로그아웃), `index.html:346`(`ADMIN_EMAILS` 유지), 로그인 버튼 핸들러

**Interfaces:**
- Consumes: `auth`(Task 2)
- Produces: 전역 `currentUser`(`{name,email}`), `isAdmin`(bool) — 렌더/쓰기 함수가 사용(기존과 동일 형태 유지).

- [ ] **Step 1: 로그인 함수 교체** — GIS `tokenClient`/`adminTokenClient`/`initGoogleAuth`(`index.html:356-370`)를 제거하고 Firebase 로그인으로:

```js
function loginWithGoogle(){
  const provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider).catch(e=>showToast('로그인 실패: '+e.message,'error'));
}
```

- [ ] **Step 2: 인증상태 리스너 추가** — 도메인 게이트 + 관리자 판정(기존 `ALLOWED_DOMAINS`/`ADMIN_EMAILS` 재사용):

```js
auth.onAuthStateChanged(user=>{
  if(!user){currentUser=null;isAdmin=false;renderLoggedOut();return;}
  const email=user.email||'';
  if(!ALLOWED_DOMAINS.some(d=>email.endsWith('@'+d))){
    showToast('@myrealtrip.com 또는 @aicx.kr 계정만 가능','error');
    auth.signOut();return;
  }
  currentUser={name:user.displayName||email,email};
  isAdmin=ADMIN_EMAILS.includes(email);
  renderLoggedIn();      // 기존 로그인 후 UI 갱신 로직 호출
});
```
> `renderLoggedOut`/`renderLoggedIn`은 기존 로그인 성공/실패 시 UI를 바꾸던 코드를 함수로 정리한 것(기존 로직 그대로, 이름만 부여). 기존에 인라인이었다면 그 본문을 이 두 함수로 이동.

- [ ] **Step 3: 로그아웃 교체** — 기존 `revoke`(`index.html:407-408`)를 `auth.signOut()`로 교체.

- [ ] **Step 4: 로그인 버튼 배선** — 기존 GSI 버튼/`handleCredentialResponse` 대신 로그인 버튼 `onclick`을 `loginWithGoogle()`로 연결. `<head>`의 GSI 스크립트(`index.html:7`)와 남은 GIS 참조 제거.

- [ ] **Step 5: 브라우저 검증** — 로컬 프리뷰에서 (a) 로그인 버튼 → 구글 팝업 → `@myrealtrip.com` 계정 로그인 성공, 사용자명 표시. (b) 콘솔에서 `isAdmin===true`(관리자 계정 시). (c) 비허용 도메인 계정은 자동 로그아웃 토스트.
> localhost는 Firebase 승인도메인에 기본 포함. 팝업 차단 시 브라우저에서 허용.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat(auth): GIS를 Firebase Auth(Google)로 교체, 도메인·관리자 게이팅 유지"
```

---

## Task 5: 읽기 교체 (gviz → Firestore 실시간 구독)

`loadSheetsData`/`sheetsGetValuesPublic`를 제거하고 `onSnapshot` 구독으로 교체. 값이 바뀌면 자동 리렌더.

**Files:**
- Modify: `index.html:497-576`(gviz 읽기·시트 부트스트랩 계열 제거), 로드 진입점

**Interfaces:**
- Consumes: `db`(Task 2), `renderStats()`/`renderCards()`(기존)
- Produces: 전역 `airlines[]`(각 원소 `{code,bsp,over,soto,reissue,chd,inf,notes,images}`), `historyData[]`(각 원소 `{id,code,route,bsp,overEY,overBZ,ticketing,departure,notes,accountCode,b2g}`) — 렌더/편집 함수가 사용.

- [ ] **Step 1: 실시간 구독 함수 작성** — `loadSheetsData`(`index.html:511`)를 대체:

```js
function subscribeData(){
  db.collection('airlines').orderBy(firebase.firestore.FieldPath.documentId())
    .onSnapshot(snap=>{
      airlines = snap.docs.map(d=>({code:d.id, ...d.data()}));
      renderStats(); renderCards();
    }, e=>showToast('데이터 읽기 실패: '+e.message,'error'));
  db.collection('history').onSnapshot(snap=>{
    historyData = snap.docs.map(d=>({id:d.id, ...d.data()}));
    renderStats(); renderCards();
  });
}
```

- [ ] **Step 2: gviz 코드 제거** — `sheetsGetValuesPublic`(497), `loadSheetsData`(511), 시트 부트스트랩(`ensureSheet` 계열 552-576) 삭제.

- [ ] **Step 3: 진입점 교체** — 페이지 로드 시 `loadEmbeddedData()`(런타임 폴백)로 화면을 채우던 흐름을 제거하고, 로그인 성공(`onAuthStateChanged` 내부) 후 `subscribeData()` 호출로 변경. (`loadEmbeddedData`의 배열 자체는 Task 6 seed 원본으로 잠시 남겨둔다.)

- [ ] **Step 4: 브라우저 검증(구독 연결)** — 로그인 후 콘솔 에러 없이 구독이 붙는지 확인. 콘솔에서 `db.collection('airlines').get().then(s=>console.log(s.size))` 실행 → 아직 seed 전이면 `0`(정상, Task 6에서 채움).

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat(read): gviz 읽기를 Firestore onSnapshot 실시간 구독으로 교체"
```

---

## Task 6: 일회성 Seed (하드코딩 배열 → Firestore)

권위 데이터(`loadEmbeddedData`의 `airlines[]`/`historyData[]`)를 Firestore에 1회 적재. 컬렉션이 비었을 때만, 관리자만.

**Files:**
- Modify: `index.html`(seed 함수 추가; `loadEmbeddedData` 배열을 seed 원본으로 사용)

**Interfaces:**
- Consumes: `db`, `isAdmin`, `loadEmbeddedData`의 배열
- Produces: Firestore `airlines/{code}` 문서 N개, `history/{autoId}` 문서 M개.

- [ ] **Step 1: seed 함수 작성** — 멱등(이미 있으면 skip):

```js
async function seedFromEmbedded(){
  if(!isAdmin){showToast('관리자만 seed 가능','error');return;}
  const existing = await db.collection('airlines').limit(1).get();
  if(!existing.empty){showToast('이미 데이터가 있어 seed를 건너뜀','');return;}
  loadEmbeddedData(); // airlines[], historyData[] 채움(전역)
  const batch = db.batch();
  airlines.forEach(a=>{
    const {code, ...rest} = a;
    batch.set(db.collection('airlines').doc(code), rest);
  });
  await batch.commit();
  for(const h of historyData){
    const {id, ...rest} = h;
    await db.collection('history').add(rest);
  }
  showToast('초기 데이터 seed 완료','success');
}
```
> Firestore batch는 500건 제한. 항공사 수십 개는 1배치로 충분. history가 500건 넘으면 청크 분할(현 데이터 규모상 불필요).

- [ ] **Step 2: seed 1회 실행** — 로컬 프리뷰에서 관리자 로그인 후 브라우저 콘솔에서 `seedFromEmbedded()` 실행. (임시 트리거; 상시 UI 버튼 불필요.)

- [ ] **Step 3: 적재 검증** — 콘솔: `db.collection('airlines').get().then(s=>console.log('airlines',s.size))` → 하드코딩 배열 개수와 일치. Firebase 콘솔 Firestore 뷰에서 `airlines/AC` 문서의 `notes`가 `~26.8.23` 문안을 포함하는지 육안 확인(권위 데이터 일치).

- [ ] **Step 4: 화면 반영 확인** — seed 직후 `onSnapshot`이 자동 발화해 대시보드 카드/표가 채워지는지 확인.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat(seed): 하드코딩 배열을 Firestore에 일회성 적재하는 seedFromEmbedded 추가"
```

---

## Task 7: 쓰기 교체 (Sheets API → Firestore) + 착시 제거

`saveAirline`/`saveImages`/`appendAuditLog`를 Firestore 쓰기로 교체. 로컬 배열을 먼저 바꾸던 낙관적 렌더링을 제거하고 `onSnapshot`이 화면을 갱신하게 한다.

**Files:**
- Modify: `index.html:1147-1177`(`saveAirline`), `index.html:1182-1187`(`saveImages`), `index.html:578-596`(`appendAuditLog`), `index.html:441-495`(Sheets 쓰기 헬퍼 제거)

**Interfaces:**
- Consumes: `db`, `currentUser`, `isAdmin`, `airlines[]`(현재 편집 대상 조회용)

- [ ] **Step 1: `saveAirline` 교체** — 시트 direct write 대신 Firestore set + 변경필드 auditLog. 로컬 배열 선반영 제거(onSnapshot이 갱신):

```js
async function saveAirline(code){
  if(!isAdmin){showToast('관리자만 저장할 수 있습니다','error');return;}
  const a=airlines.find(x=>x.code===code);if(!a)return;
  const old={bsp:a.bsp,over:a.over,soto:a.soto,reissue:a.reissue,chd:a.chd,inf:a.inf,notes:a.notes};
  const next={
    bsp:val('ed-bsp'),over:val('ed-over'),soto:val('ed-soto'),reissue:val('ed-reissue'),
    chd:val('ed-chd'),inf:val('ed-inf'),notes:val('ed-notes'),images:a.images||[]
  };
  // 히스토리 수집(기존 DOM 파싱 로직 유지)
  const codeHist=collectHistRows(code); // 기존 rows.forEach(...) 로직을 함수화
  showToast(`${code} 저장 중...`,'');
  try{
    await db.collection('airlines').doc(code).set(next,{merge:true});
    // 해당 code의 history 전량 교체: 기존 삭제 후 재기록
    const oldHist=await db.collection('history').where('code','==',code).get();
    const batch=db.batch();
    oldHist.forEach(d=>batch.delete(d.ref));
    codeHist.forEach(h=>batch.set(db.collection('history').doc(), h));
    await batch.commit();
    // auditLog: 변경된 필드만
    const fields=['bsp','over','soto','reissue','chd','inf','notes'];
    for(const f of fields){ if(String(old[f])!==String(next[f])) await appendAuditLog(code,f,old[f],next[f]); }
    showToast(`${code} 저장 완료`,'success');
  }catch(e){showToast(`${code} 저장 실패: ${e.message}`,'error');}
}
function val(id){return document.getElementById(id).value;}
```
> `collectHistRows(code)`는 기존 `saveAirline` 내 `rows.forEach(...)`(`index.html:1158-1159`)를 그대로 옮겨 `{code,route,bsp,overEY,overBZ:'',ticketing,departure,notes,accountCode,b2g:false}` 배열을 반환하도록 함수화.

- [ ] **Step 2: `appendAuditLog` 교체** — 시트 append 대신 Firestore add:

```js
async function appendAuditLog(code,field,before,after){
  await db.collection('auditLog').add({
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    userName: currentUser?.name||'', userEmail: currentUser?.email||'',
    code, field, before:String(before), after:String(after)
  });
}
```

- [ ] **Step 3: `saveImages` 교체** — 드라이브 업로드는 유지, 저장만 Firestore:

```js
async function saveImages(code){
  if(!isAdmin)return;
  const a=airlines.find(x=>x.code===code);if(!a)return;
  try{ await db.collection('airlines').doc(code).set({images:a.images||[]},{merge:true}); }
  catch(e){console.error('saveImages error:',e);}
}
```

- [ ] **Step 4: Sheets 쓰기 헬퍼 제거** — `ensureAdminToken`(441), `sheetsApiWrite`(456), `sheetsAppend`(465), `sheetsUpdate`(471), `updateAirlineRowDirect`(479) 삭제. `SHEET_ID`/`SHEET_URL`/`openSheetDirect` 등 시트 참조 제거(시트 바로가기 버튼 있으면 삭제).

- [ ] **Step 5: 두 브라우저 실시간 검증** — 프리뷰 창 A(관리자)에서 `AA`의 `over`를 `9`로 저장 → 창 B(다른 세션/시크릿, 허용도메인 로그인)에서 **새로고침 없이** `AA over=9`가 수 초 내 반영되는지 확인. (핵심 버그 해소 검증.)

- [ ] **Step 6: 비관리자 쓰기 차단 검증** — 비관리자(허용도메인) 계정 콘솔에서 `db.collection('airlines').doc('AA').set({over:'99'},{merge:true})` 시도 → `permission-denied` 에러로 거부되는지 확인.

- [ ] **Step 7: auditLog 확인** — 저장 후 Firebase 콘솔 `auditLog`에 변경 필드별 문서(변경자 이메일·이전/변경값)가 생기는지 확인.

- [ ] **Step 8: Commit**

```bash
git add index.html
git commit -m "feat(write): Sheets 쓰기를 Firestore로 교체, 낙관적 렌더 착시 제거, auditLog 이전"
```

---

## Task 8: 정리 (dead code + 문서)

시트 잔재·고아 파일 제거, README 갱신, seed 임시코드 정리.

**Files:**
- Modify: `index.html`(잔여 시트 상수·`loadEmbeddedData` 처리), `README.md`
- Delete: `gas-webapp.js`, `commission.html`

- [ ] **Step 1: seed 원본 처리** — Task 6 seed 성공·검증 완료 후 `loadEmbeddedData`를 제거하거나, 재-seed 방지를 위해 `seedFromEmbedded` 내부의 "empty일 때만" 가드를 유지한 채 남겨둘지 결정. 기본: **`loadEmbeddedData`와 `seedFromEmbedded` 모두 제거**(Firestore가 단일 진실원). 롤백 대비로 seed용 JSON을 `docs/`에 백업.

- [ ] **Step 2: 잔여 시트 상수 제거** — `COMM_SHEET`/`HIST_SHEET`/`AUDIT_SHEET_NAME`/`CLIENT_ID` 등 미사용 상수 삭제.

- [ ] **Step 3: 고아/방치 파일 삭제** — `git rm gas-webapp.js commission.html`.

- [ ] **Step 4: README 갱신** — "데이터 흐름"/"읽기 vs 쓰기 권한"/"TODO(토큰만료)" 섹션을 Firestore 기준으로 재작성: 실시간 구독, 보안규칙 기반 권한, 토큰만료 항목 제거, 관리자 추가 방법(상수+규칙 2곳) 명시.

- [ ] **Step 5: 로컬 회귀 확인** — 프리뷰에서 로그인→조회→저장→실시간반영 전체 흐름이 콘솔 에러 없이 동작.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: 시트 잔재·고아 파일 제거, README를 Firestore 기준으로 갱신"
```

---

## Task 9: 배포 + 엔드투엔드 검증 (사용자 승인 게이트)

`main` 병합·push는 프로덕션 배포이므로 **사용자 명시 승인 후** 진행.

**Files:** 없음(git 병합·배포).

- [ ] **Step 1: 사용자 승인 확인** — "지금 프로덕션 배포해도 되나요?" 확인. 승인 전엔 대기.

- [ ] **Step 2: main 병합 + push** — 승인 시:

```bash
git checkout main
git merge --no-ff firestore-migration
git push origin main
```

- [ ] **Step 3: Pages 재배포 대기** — 1~2분 후 https://haraman-myrealtrip.github.io/airline-commissions/ 접속.

- [ ] **Step 4: 성공 기준 검증(운영 도메인)** —
  - [ ] 관리자 저장 → 다른 접속자 화면 수 초 내 자동 반영(새로고침 불필요)
  - [ ] 1시간+ 세션에서도 저장 지속(토큰만료 없음)
  - [ ] 비관리자 쓰기 차단(`permission-denied`)
  - [ ] 허용 도메인 밖 계정 로그인 차단
  - [ ] seed된 데이터가 기존 화면값과 일치

- [ ] **Step 5: 메모리 갱신** — `project_commission_dashboard_write_bug.md`를 "Firestore 이전으로 해결됨"으로 갱신 또는 종료 처리.

---

## Self-Review (계획 자체 점검)

- **Spec coverage:** 설계 §1~10 각 항목 → Task 매핑. 문제4개(쓰기실패/토큰만료/착시/읽기지연)=Task4~7·9 검증. 무료/이미지유지=Global Constraints. 데이터모델=Task5~7. 권한=Task3. 이관=Task6. 사람준비물=Task1. 성공기준=Task9 Step4. 누락 없음.
- **Placeholder scan:** Task 1 config 값(`<전달받은 값>`)은 사람이 실제로 전달해야 하는 실 입력값이라 의도된 공란. 그 외 TODO/TBD 없음.
- **Type consistency:** `airlines` 원소 `{code,bsp,over,soto,reissue,chd,inf,notes,images}`, `history` 원소 `{id?,code,route,bsp,overEY,overBZ,ticketing,departure,notes,accountCode,b2g}`, auditLog 필드명이 Task5/6/7 전반에서 일관. `db`/`auth`/`isAdmin`/`currentUser` 명칭 일치.
