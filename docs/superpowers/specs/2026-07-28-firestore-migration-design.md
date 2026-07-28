# 커미션 대시보드: 구글시트 → Firestore 이전 설계

- **작성일**: 2026-07-28
- **저장소**: `haraman-myrealtrip/airline-commissions` (GitHub Pages 정적 사이트, 단일 `index.html`)
- **작성자**: hyerim.kim@myrealtrip.com

---

## 1. 배경 / 문제

현재 대시보드는 **정적 사이트(GitHub Pages)가 브라우저에서 직접 구글시트에 읽고 쓰는** 구조다. 이 때문에 다음 문제가 반복된다.

1. **쓰기 실패 (핵심 버그)** — 관리자가 값 수정 시 본인 화면엔 낙관적 렌더링으로 보이지만, 시트에 실제로 안 들어가 다른 접속자에겐 영영 안 보임. 원인은 관리자 OAuth 토큰의 시트 쓰기 권한 거부(403) 또는 시트 잠금.
2. **토큰 만료** — 관리자 쓰기가 구글 로그인 시 받은 1시간짜리 토큰으로만 동작. 만료 후 저장이 조용히 실패.
3. **렌더 착시** — `saveAirline()`이 로컬 배열을 먼저 바꿔 렌더하므로, 저장 성공 여부와 무관하게 성공한 것처럼 보임.
4. **읽기 지연** — 다른 접속자는 gviz 공개 엔드포인트로만 읽어 캐시 지연 발생.

## 2. 결정

**구글시트를 버리고 Firebase Firestore로 데이터 저장소를 이전한다.**

- 사용자 확정: "이제 시트를 직접 열어 편집하지 않고 **대시보드로만** 관리한다." → 시트를 중간 매개로 유지할 이유가 없음.
- Firestore로 가면 위 4개 문제가 근본적으로 사라진다: 실시간 반영, 토큰 만료 없음(SDK 자동 갱신), 권한규칙 기반 쓰기, 단일 진실원(하드코딩 폴백 제거).

### 비용
- **무료(Spark 요금제), 신용카드 불필요.** 무료 한도: 읽기 5만/일, 쓰기 2만/일, 저장 1GiB. 항공사 수십 개 + 내부 팀 사용량은 한도의 1% 미만.
- 유료(Blaze)가 필요한 기능(**Cloud Functions, Firebase Storage**)은 **사용하지 않는 설계**로 무료를 유지한다.
- 데이터 이관은 일회성 무료 작업.

## 3. 아키텍처 (변경 대비)

| 구성 | 지금 (Sheets) | 이후 (Firestore) |
|---|---|---|
| 읽기 | gviz 공개 URL (캐시 지연) | Firestore 실시간 구독(`onSnapshot`) → 즉시 갱신 |
| 쓰기 | 관리자 OAuth 토큰(1h) → 시트 direct write (403/만료) | Firestore SDK write, 보안규칙으로 관리자만 허용, 토큰 만료 없음 |
| 로그인 | Google Identity Services (GIS) | Firebase Auth(Google provider), 도메인 제한 유지 |
| 이미지 | 구글 드라이브 업로드 → 공개 링크 | **변경 없음** (URL만 Firestore에 저장) |
| HTML 하드코딩 폴백 | 있음 | **제거** (Firestore가 단일 진실원) |

## 4. 데이터 모델 (Firestore 컬렉션)

기존 시트 4개 탭 → 컬렉션 4개로 1:1 대응.

- **`airlines/{code}`** — 문서 ID = 항공사 코드
  - 필드: `bsp, over, soto, reissue, chd, inf, notes` (문자열), `images` (배열: `{id,url,viewUrl,label,mimeType}`)
  - 기존 시트 `대시보드_커미션` 컬럼과 대응 (`code`는 문서 ID로 승격)
- **`history/{autoId}`** — 자동 ID
  - 필드: `code, route, bsp, overEY, overBZ, ticketing, departure, notes, accountCode, b2g`
  - 기존 `대시보드_히스토리` 대응. 조회 시 `where('code','==',...)` 필터
- **`auditLog/{autoId}`** — 자동 ID
  - 필드: `timestamp(서버시간), userName, userEmail, code, field, before, after`
  - 기존 `변경이력` 대응. 관리자 저장 시 변경 필드별 1건 추가. 조회는 `where('code','==',...)` 후 최신순.
- **`notices/{autoId}`** — 자동 ID (⚠️ 최초 계획 누락분, 반영)
  - 필드: `title, body, urgent(bool), banner(bool), date(문자열)`
  - 기존 `공지사항` 시트 대응. 종/드롭다운/배너 UI + 최고관리자(`haram.an`) 등록·삭제.
  - 기존 정수 `id`는 문서 ID(autoId)로 대체.

### 4.1 추가 결정 (2026-07-28)
- **이미지 첨부**: ~~구글 드라이브 유지~~ → **기능 완전 제거** (2026-07-28 사용자 확정). 현재 권위 데이터(하드코딩 배열)의 모든 항공사 `images`가 빈 배열이라 잃는 데이터 없음. 이미지가 유일하게 Google API 토큰(drive.file)을 요구하던 부분이므로, 제거하면 인증이 순수 Firebase Auth가 되어 토큰만료·재consent 이슈가 원천 소멸. detail 페이지의 아카이빙 이미지 섹션 + 관리 UI + 업로드/삭제 로직 + 이미지 모달 모두 삭제. 향후 필요 시 Firebase Storage로 별도 검토.
  - 삭제 대상 함수/필드: `handleFileUpload`, `uploadFileToDrive`, `removeFile`, `addImage`, `removeImage`, `updateImgLabel`, `saveImages`, `onImgError`, `openImgModal`/`closeModal`(이미지 모달), `airlines.images` 필드.
- **새 항공사 추가**: 관리 패널에 "새 항공사 추가" 기능 신설(코드+초기값 입력 → `airlines/{code}` 생성). 기존엔 HTML 하드코딩으로만 가능했음. 삭제 기능은 현행에 없으므로 범위 밖.
- **최고관리자(super admin)**: `haram.an@myrealtrip.com`. 공지 관리·관리자 목록 UI는 최고관리자만 노출(현행 유지).

## 5. 인증 / 권한

- **로그인**: Firebase Auth Google provider. 로그인 후 이메일 도메인이 `myrealtrip.com` / `aicx.kr`가 아니면 거부(현행 `ALLOWED_DOMAINS`와 동일).
- **관리자 판정**: `ADMIN_EMAILS` 목록(현행: `haram.an@`, `sieon.choi@`, `hyerim.kim@`)에 포함된 계정만 쓰기 UI 노출.
  - **추후 관리자 추가**: 목록을 한 곳(코드 상수 + 보안규칙 동일 목록)에서 수정하면 됨. 추가 = 두 곳에 이메일 한 줄 넣고 push(1~2분 내 자동 배포). 관리자 목록·허용도메인은 이 두 곳에만 존재해 관리 지점이 명확하도록 유지.
- **Firestore 보안 규칙** (서버 측 강제 — UI 우회 방지):
  - 읽기: 로그인 + 이메일 도메인 허용목록에 포함
  - 쓰기(`airlines`, `history`, `auditLog`): 로그인 + 이메일이 관리자 목록에 포함
  - 관리자 목록·허용 도메인은 보안 규칙 안에 하드코딩(별도 서버 불필요, 무료 유지).

## 6. 마이그레이션 (일회성)

⚠️ **이관 원본이 "시트"가 아닐 수 있음.** 사용자 증언상 관리자(하람)가 대시보드/코드에 값을 하드코딩해 왔고 시트엔 자동 반영이 안 됐을 가능성이 큼. 그렇다면 **현재 사람들이 실제로 보는 값 = `index.html`의 하드코딩 배열(`airlines[]`, `historyData[]`)**이고 시트는 낡았을 수 있음.

1. **권위 데이터 확정** — 세 소스를 비교한다: ①배포본 `index.html`의 하드코딩 배열, ②시트 `1pmVuY...`, ③메모상 언급된 `12qqW...`. 대시보드에 실제 뜨는 화면과 대조해 **현행 정답값**을 확정한다. 기본 가정: 하드코딩 배열이 최신(불일치 항목은 사용자에게 확인).
2. 확정된 권위 데이터를 위 컬렉션 구조로 Firestore에 1회 적재하는 스크립트 작성·실행.
3. 적재 후 대시보드에서 값이 일치하는지 검수.

## 7. 코드 변경 범위 (`index.html` 단일 파일)

- **제거**: `sheetsApiWrite`, `sheetsAppend`, `sheetsUpdate`, `updateAirlineRowDirect`, `sheetsGetValuesPublic`, `ensureAdminToken`, `ensureSheet`류, GIS 토큰 클라이언트, 하드코딩 폴백 데이터(`loadEmbeddedData`).
- **추가**: Firebase SDK(CDN, ESM), 초기화 config, `onSnapshot` 구독 기반 읽기, `setDoc`/`addDoc` 쓰기, Firebase Auth 로그인 흐름.
- **유지**: 이미지 드라이브 업로드 로직, UI/렌더 함수(`renderCards`, `renderStats` 등), `ADMIN_EMAILS`/`ALLOWED_DOMAINS` 상수.
- 낙관적 렌더링 제거: 쓰기는 Firestore에 반영 → `onSnapshot`이 되돌려주는 값으로 화면 갱신(착시 근본 제거). 저장 실패 시 명확한 에러 토스트.

## 8. 사람이 해야 하는 준비물 (Claude 불가)

1. **Firebase 프로젝트 생성** — 사용자 구글계정으로 Firebase 콘솔에서 프로젝트 신설(무료).
2. **Firestore 데이터베이스 활성화** + **Google 로그인 provider 켜기**.
3. **웹 앱 등록** 후 config 키(apiKey 등, 공개되어도 무방) 확보 → Claude에 전달.
4. **승인된 도메인**에 `haraman-myrealtrip.github.io`(+ 로컬 테스트용 도메인) 추가.

이 단계들은 구현 계획에서 스크린 단위로 콕 집어 안내한다.

## 9. 범위 밖 (YAGNI)

- Cloud Functions / 서버 백엔드 — 불필요(클라이언트 SDK + 보안규칙으로 충분).
- Firebase Storage — 이미지는 드라이브 유지.
- `commission.html`(고아 파일), `gas-webapp.js`(방치) — 이번 작업에서 정리 대상이나 필수 아님(구현 계획에서 삭제 여부 결정).
- 데이터 스키마 확장/신규 기능 — 현행 기능 동등 이전에 집중.

## 10. 성공 기준

- [ ] 관리자가 대시보드에서 값 수정 → 다른 접속자 화면에 **수 초 내 자동 반영**(새로고침 불필요).
- [ ] 1시간 이상 세션에서도 저장이 끊기지 않음(토큰 만료 없음).
- [ ] 비관리자 계정은 쓰기 불가(보안규칙으로 서버에서 차단).
- [ ] 허용 도메인 밖 계정 로그인 차단.
- [ ] 기존 시트 데이터가 손실 없이 이관됨.
