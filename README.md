# 항공사 커미션 대시보드

항공사업팀 내부용 항공사 커미션(오버컴 포함) 조회·관리 대시보드입니다.

- **배포 URL**: https://haraman-myrealtrip.github.io/airline-commissions/
- **호스팅**: GitHub Pages (`main` 브랜치 / 루트의 `index.html` 서빙)
- **접근 권한**: `@myrealtrip.com`, `@aicx.kr` 구글 계정만 로그인 가능

---

## 사이트 구조

### 1. 파일 구성

| 파일 | 설명 |
|------|------|
| `index.html` | **실제 배포본.** HTML·CSS·JS가 모두 인라인으로 들어있는 단일 파일(약 1,165줄). Pages가 이 파일을 서빙함. |
| `commission.html` | 초기 버전으로 보이는 파일. 현재 `index.html`을 포함해 어디에서도 링크되지 않는 **고아(orphan) 파일** — 배포/사용 안 됨. |
| `README.md` | 본 문서. |

> 별도의 빌드 과정·프레임워크·CI 없음. `index.html`을 `main`에 푸시하면 GitHub Pages가 자동 재배포(보통 1~2분).

### 2. 데이터 흐름 (핵심) — Firebase Firestore 기반 (2026-07-28 이전)

이 대시보드는 **Firebase Firestore를 단일 데이터 저장소**로 사용합니다. 구글시트 직접 read/write 구조는 폐기되었습니다.

```
로그인(Firebase Auth)
  │
  └─ subscribeData()  → Firestore 컬렉션을 실시간 구독(onSnapshot)
        airlines/{코드}  → 커미션 요약 표/카드
        history/{자동ID} → 상세 이력 표 (code로 필터)
        notices/{자동ID} → 공지사항(종/배너)
```

**중요**: 관리자가 값을 저장하면 Firestore에 기록되고, **모든 접속자 화면에 실시간(수 초 내)으로 자동 반영**됩니다. 새로고침·시트 수동 동기화 불필요. HTML 하드코딩 폴백은 제거되었습니다(Firestore가 단일 진실원).

### 3. Firebase / Firestore

- **프로젝트 ID**: `mrt-air-comm` (Spark 무료 요금제)
- **컬렉션**
  - `airlines/{항공사코드}` — BSP컴/오버컴/SOTO/재발행/CHD/INF/비고 (문서 ID = 항공사 코드)
  - `history/{자동ID}` — 노선·기간별 상세 오버컴 이력
  - `auditLog/{자동ID}` — 관리자 저장 시 변경 필드별 감사 로그(서버시간/변경자/이메일/항목/이전값/변경값)
  - `notices/{자동ID}` — 공지사항(제목/내용/긴급/배너/날짜)
- 설정 상수는 `index.html` 상단 `firebaseConfig`. 보안규칙 원본은 `firestore.rules`(콘솔 Firestore→규칙에 게시).

### 4. 읽기 vs 쓰기 (권한 구조)

| 동작 | 방식 | 필요 권한 |
|------|------|-----------|
| **읽기(실시간)** | Firestore `onSnapshot` | 로그인 + 허용 도메인 (보안규칙) |
| **쓰기(저장/공지/항공사추가)** | Firestore `set`/`add`/`delete` | 관리자 계정 (보안규칙 + UI) |

- 인증: **Firebase Auth(Google provider)**. 허용 도메인 `ALLOWED_DOMAINS = ['myrealtrip.com','aicx.kr']`. 세션이 브라우저에 유지되어 재로그인 반복 없음.
- 관리자: `index.html`의 `ADMIN_EMAILS` + `firestore.rules`의 `isAdmin` 목록에 등록된 계정만 쓰기 가능. **관리자 추가 시 두 곳 모두 수정** 후 push.
- 접근제어는 클라이언트 UI가 아니라 **Firestore 보안규칙이 서버에서 강제**하므로, UI를 우회해도 비관리자·외부도메인은 쓰기/읽기 불가.

### 5. 새 항공사 추가 / 초기 데이터 seed

- 관리 패널의 **"+ 새 항공사 추가"** 로 코드 입력 → 항공사 문서 생성 후 값 편집.
- 컬렉션이 비어 있을 때 관리 패널 상단에 **"초기 데이터 가져오기"** 버튼이 표시됨(관리자). 클릭 시 `seedFromEmbedded()`가 `loadEmbeddedData()`의 기존 값을 Firestore에 1회 적재(멱등 — 이미 데이터가 있으면 skip).

---

## 이전 이력 (2026-07-28)

구글시트 직접 read/write 구조에서 발생하던 문제들(관리자 저장이 남에게 안 보임=쓰기 403/시트 잠금, OAuth 토큰 1시간 만료, 낙관적 렌더 착시, gviz 캐시 지연, 로그인 반복 요청)을 Firestore 이전으로 근본 해결. 설계·계획: `docs/superpowers/specs/`·`docs/superpowers/plans/`.

- ~~[1] OAuth 토큰 1시간 만료~~ → Firebase Auth 세션 지속으로 해소
- ~~[2] 저장 직전 토큰 재발급~~ → 불필요(토큰 개념 소멸)
- ~~[3] GAS 중계 전환 검토~~ → Firestore 이전으로 대체(GAS 불필요)

방치 파일 `gas-webapp.js`, 고아 파일 `commission.html`은 사용되지 않음(추후 삭제 가능).
