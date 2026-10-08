# Meta 광고 성과 분석 대시보드 — 설계 계획 (PLAN.md)

> 현재 단계는 **설계만** 수행하며 코드는 작성하지 않습니다.

---

## Context (배경)

Meta 광고관리자의 캠페인/광고세트/광고 성과를 자동 수집하고, 광고별 성과를 규칙 기반으로 판정한 뒤 이해하기 쉬운 한국어 분석문으로 정리해 주는 **회사 내부용 대시보드**를 만든다. 사이트는 광고를 자동 제어하지 않고, 데이터·판정 근거·추천 액션만 제공하며 최종 결정은 사용자가 내린다.

**확정된 핵심 설계 결정 (사용자 확인 완료):**
- **Meta 연결**: 중앙 System User 장기 토큰 1개를 서버에 저장. 사이트 사용자는 Supabase 로그인만 하고, `user_ad_account_access` 권한으로 접근 가능한 광고계정을 제어한다.
- **분석 계산 시점**: 하이브리드. 규칙 엔진 판정·지표는 온디맨드로 빠르게 계산하고, Claude 서술문만 (데이터+기간 해시 기준) 캐싱하여 동일 입력 → 동일 출력을 보장하고 비용을 절감한다.

---

## 1. 현재 프로젝트 파일 구조

프로젝트 디렉터리 `C:\Users\최윤정\Documents\meta-ads-analyzer`는 **비어 있음** (greenfield). Git 저장소 아님. 재사용할 기존 코드·패턴 없음 → 스택 초기 설정부터 시작.

---

## 2. 요구사항 충돌 및 주의점

| # | 항목 | 내용 및 해결 방향 |
|---|------|------------------|
| C1 | **ROAS 표기** | 스펙은 ROAS = 매출÷광고비×100 (예: 350%). Meta의 `purchase_roas`는 배수(3.5x). → 우리 ROAS = `purchase_roas`×100로 정의하고 UI 전체를 % 단위로 통일. 툴팁에 "배수×100" 명시. |
| C2 | **CTR/CPC 정의** | 스펙은 링크 클릭 기준. Meta 기본 CTR/CPC는 전체 클릭 기준. → `inline_link_clicks`(link_clicks)로 계산. Meta의 `ctr`/`cpc` 필드 사용 금지, 서버에서 재계산. |
| C3 | **구매 전환율 분모** | 스펙: 구매수÷랜딩페이지조회×100 (링크클릭 아님). → 랜딩 도달 이후 전환 효율을 보는 지표로 일관 적용. 툴팁 명시. |
| C4 | **자동 로그인 vs 보안** | "자동 로그인 유지" + "비밀번호 LocalStorage 저장 금지"는 충돌 아님. Supabase는 세션 토큰(refresh token)만 저장, 비밀번호는 저장 안 함. → `persistSession: true` + localStorage 세션 스토리지 사용. 비밀번호는 어디에도 저장 안 함. |
| C5 | **회원가입 없음 + 비밀번호 찾기** | 관리자가 Supabase에서 사전 등록. 비밀번호 찾기(재설정 메일)는 유지하되, 신규 가입은 차단(Supabase에서 signups 비활성화). |
| C6 | **광고 최대 5개 "운영 기준"** | UI는 5개 기준 최적화하되 6개+ 정상 동작. DB·API에 개수 제한 두지 않음(가상 스크롤/오버플로우 처리). |
| C7 | **다기기 자동로그인 vs 기기 격리** | 한 기기 로그인이 다른 기기를 인증하지 않음. Supabase 세션은 기기/브라우저별 독립 저장이므로 자연 충족. |
| C8 | **색상 단독 상태 구분 금지** | 성과 배지는 텍스트+아이콘+색상 3중 표기 필수(접근성). |

---

## 3. 빠진(추가 필요) 필수 기능

스펙에 명시되지 않았으나 반드시 설계에 포함해야 하는 항목:

1. **타임존 처리** — Meta insights는 광고계정 타임존 기준. `daily_insights.date`는 계정 타임존 기준 날짜로 저장. 이전 기간 비교·일별 추이가 계정 타임존과 어긋나지 않도록 계정별 타임존을 `ad_accounts`에 저장.
2. **Attribution 윈도우 설정** — 구매 수/매출은 attribution 설정(예: 7d click / 1d view)에 좌우됨. 동기화 시 사용한 윈도우를 `analysis_settings`에 저장하고 화면에 표기. 스펙 34번(전환 측정 문제)의 근거로 사용.
3. **다중 통화** — 광고계정마다 통화가 다를 수 있음. 기여도 계산은 **동일 통화 내(같은 계정/세트/캠페인)**에서만 수행. 계정 간 집계 시 통화 혼합 금지. `daily_insights.currency` 필수 저장.
4. **분석 결과·Claude 응답 캐싱** — 하이브리드 전략: `analysis_results`에 규칙 판정 캐시, Claude 서술문은 `(광고ID, 기간, 데이터 해시, 설정 해시)` 키로 캐싱하여 재현성·비용 관리.
5. **동기화 커서/증분 로직** — 마지막 성공 날짜부터 증분 수집. 완료된 날짜도 최근 N일은 재수집(Meta 데이터 소급 갱신 대응). `sync_logs`에 범위·상태 기록.
6. **Rate limit / 재시도 백오프** — Meta API 429/오류 시 지수 백오프 + 재시도. 부분 실패 시 수집된 데이터는 저장하고 경고 플래그.
7. **부분 데이터 완전성 플래그** — 지표별 수집 성공 여부(전환/영상 데이터 누락 구분)를 행 단위로 표기.
8. **감사/접근 로그** — 어떤 사용자가 어떤 계정을 조회했는지 최소 로깅(개인정보·토큰 제외).
9. **관리자용 사용자·권한 관리 방식** — 초기에는 Supabase 콘솔에서 직접 관리(별도 관리 UI는 후순위).

---

## 4. 전체 사용자 흐름

```
[사이트 진입]
  → 인증 상태 확인(로딩 화면, 데이터 노출 금지)
      ├─ 세션 없음 → 로그인 화면 → 로그인 성공
      └─ 세션 있음(자동 로그인) → 다음 단계
  → 마지막 사용 광고계정 접근 가능?
      ├─ 예 → 해당 광고계정 대시보드 자동 오픈
      └─ 아니오(최초/권한소멸/삭제/변경버튼) → 광고계정 선택 화면
  → [광고계정 선택 화면] 비즈니스 포트폴리오 → 광고계정 선택
  → [3단 탐색] 캠페인 → 광고세트 → 광고
  → [광고 상세 분석] 핵심 결론 → 지표 → 비교 → 추이 → 진단 → 기여도 → 비교 → 공유용 요약
  → 보고 문구 복사 / PDF·엑셀·CSV 내보내기
```

**항상 보이는 컨텍스트(헤더 브레드크럼):** 비즈니스 포트폴리오 · 광고계정 · 캠페인 · 광고세트 · 광고 · 조회 기간.

---

## 5. 로그인 및 자동 로그인 흐름

- **스택**: Supabase Auth (email/password), `@supabase/ssr` (Next.js App Router 미들웨어 기반 세션).
- **세션 지속**: `persistSession: true`, `autoRefreshToken: true`. Access Token 만료 시 Refresh Token으로 자동 갱신. 세션은 기기/브라우저별 독립.
- **인증 상태 확인 중**: 전역 로딩 화면. 확인 전 대시보드 데이터 렌더 금지.
- **보호**: (1) 클라이언트 라우트 가드 + (2) **서버(미들웨어/Route Handler)에서 세션 재검증** — 클라이언트 검사만 의존 금지.
- **다탭 동기화**: `supabase.auth.onAuthStateChange` + storage 이벤트로 로그인/로그아웃 상태를 모든 탭에 전파.
- **세션 갱신 실패**: 로그인 화면으로 이동, 화면 상태 초기화.
- **승인되지 않은 사용자**: Supabase에 미등록 → 로그인 불가. 등록됐으나 `profiles`/권한 없음 → "권한 없음" 화면.

```
[앱 부팅]
  → getSession()
      ├─ 세션 O → onAuthStateChange 구독 → 라우팅
      └─ 세션 X → /login
[토큰 만료] → autoRefreshToken → 성공 시 유지 / 실패 시 /login
[다른 탭 로그아웃] → onAuthStateChange(SIGNED_OUT) → 현재 탭도 로그아웃
```

---

## 6. 로그인 계정 변경 흐름 (≠ 광고계정 변경)

우측 상단 **사용자 메뉴** 안에 배치. 헤더의 "광고계정 변경"과 위치·명칭을 분리.

```
[사용자 메뉴 → "로그인 계정 변경"]
  1. 확인 다이얼로그("현재 계정에서 로그아웃하고 다른 계정으로 로그인")
  2. supabase.auth.signOut() — 세션 완전 종료
  3. 클라이언트 상태 초기화(React Query 캐시 clear, Zustand store reset, 마지막선택 등)
  4. /login 이동
  5. 새 이메일/비밀번호 로그인
  6. 새 사용자의 user_business_access / user_ad_account_access 재조회
  7. 새 권한 기준으로 화면 재구성
```

**핵심 보안:** 계정 변경 중 이전 사용자의 광고 데이터/분석 결과가 절대 노출되지 않도록, signOut 시 **모든 클라이언트 캐시를 즉시 무효화**하고 라우트를 로그인으로 강제 이동.

---

## 7. 비즈니스 포트폴리오 · 광고계정 선택 흐름

```
로그인 성공
  → GET /api/portfolios  (서버: user_business_access 조인)
      → 좌측: 포트폴리오 목록(이름, 광고계정 수, 소유/공유 구분, 선택 상태)
  → 포트폴리오 선택 → GET /api/ad-accounts?portfolio=...
      → 우측: 광고계정 목록(이름, ID, 활성/비활성, 소유/공유, 마지막 동기화, 선택 버튼)
  → 검색(이름/ID) · 활성만 보기 · 최근 사용 · 정렬 · 접근 가능 수 표시
  → 광고계정 선택 → user_preferences 저장 → 대시보드 진입
```

포트폴리오/광고계정 **개수 제한 없음**. 한 사용자가 여러 포트폴리오 접근 가능. 소유 자산과 공유받은 자산을 시각적으로 구분.

---

## 8. 캠페인 · 광고세트 · 광고 탐색 흐름

- 3단 패널(캠페인 → 광고세트 → 광고) + 4번째 영역(선택 광고 상세). 각 단계는 상위 선택에 종속.
- 캠페인 선택 시 해당 캠페인의 광고세트만, 광고세트 선택 시 해당 세트의 광고만 표시.
- 각 선택 상태는 `user_preferences`에 저장되어 다음 방문 시 복원.
- 패널 접기/너비 조절/상세 전체화면 지원(좁은 화면 대응).

---

## 9. 텍스트 와이어프레임

### 9.1 상단 헤더 (전 화면 공통)
```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [로고/서비스명]  포트폴리오 > 광고계정 ▾ [광고계정 변경]   │ 기간: 최근7일 ▾  │
│                                                            │ 이전기간 비교 ✓  │
│                                       마지막 업데이트 08-06 09:12 [새로고침 ↻] │
│  [요약 보기] [상세 분석] [성과 보고서 내보내기]        [user@co ▾ 사용자메뉴] │
│                                                        └ 현재 이메일          │
│                                                        └ 로그인 계정 변경     │
│                                                        └ 로그아웃             │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 9.2 광고계정 선택 화면
```
┌ 비즈니스 포트폴리오 ─────────┐┌ 광고계정 ─────────────────────────────────┐
│ ● 포트폴리오 A (계정 4개)    ││ [검색: 이름/ID] [활성만☐] [정렬▾] 접근 12개 │
│   소유                       ││ ─────────────────────────────────────────── │
│ ○ 포트폴리오 B (계정 8개)    ││ 쥬스박스 광고계정 4  act_123  ●활성 소유     │
│   공유                       ││   마지막 동기화 08-06 03:00      [선택]      │
│                              ││ 쥬스박스 광고계정 5  act_456  ○비활성 공유   │
│                              ││   ...                            [선택]      │
└──────────────────────────────┘└──────────────────────────────────────────────┘
```

### 9.3 3단 탐색 + 상세 (1440px 기준)
```
┌ 캠페인 ────┬ 광고세트 ──┬ 광고 ──────────┬ 선택 광고 상세 분석 ───────────────┐
│ [검색][필터]│ [검색]     │ [검색]         │ ① 기본정보(썸네일/ID/기간)          │
│ 캠페인 A ▸ │ 세트 A-1 ▸ │ ▣ 영상 광고1   │ ② 핵심 결론(판정·근거·추천액션)     │
│  배지·비용 │  배지·비용 │  배지 CPA ROAS │ ③ 핵심 지표(그룹 카드)              │
│ 캠페인 B   │ 세트 A-2   │ ▣ 이미지 광고2 │ ④ 이전 기간 비교                    │
│ 캠페인 C   │ 세트 A-3   │ ▣ 광고3..5     │ ⑤ 일별 추이(지표 선택)              │
│            │            │ (6개+ 스크롤)  │ ⑥ 자동 진단                         │
│ [접기]     │ [접기]     │ [너비조절]     │ ⑦ 기여도(범위: 세트/캠페인/계정)   │
│            │            │                │ ⑧ 세트 내 광고 비교                 │
│            │            │                │ ⑨ 공유용 요약  ⑩ 원본 데이터        │
└────────────┴────────────┴────────────────┴─────────────────────────────────────┘
```

### 9.4 광고 상세 — 핵심 결론 블록
```
┌ 핵심 결론 ─────────────────────────────────────────────────────────────┐
│ [배지: 유지] 데이터 충분  신뢰도 높음                                    │
│ "목표 CPA보다 낮고 ROAS가 기준을 충족해 유지 및 디벨롭 후보로 보입니다." │
│ 근거: ① ROAS 420%(기준 300%) ② CPA 12,300원(목표 15,000원) ③ CTR 상위   │
│ 추천 액션: 유지 + 동일 후킹 구조 디벨롭 소재 병행 검토                    │
│ 주의: 최근 빈도 상승·후킹률 하락 → 소재 피로도 추가 확인 필요            │
└──────────────────────────────────────────────────────────────────────────┘
```

### 9.5 지표 카드 그룹 (예: 클릭 효율)
```
┌ 클릭 효율 ──────────────────────────────────────────────┐
│ CTR      1.8%   이전 2.1%  ▼14%  [주의]  "클릭률 하락"   │
│ CPC      420원  이전 360원 ▲17%  [주의]  "클릭당 비용↑"  │
│  (지표명 hover → 의미/계산식/출처/해석기준 툴팁)         │
└──────────────────────────────────────────────────────────┘
```

### 9.6 전체 광고계정 요약(광고 미선택 시)
```
기간/이전 대비 전체 변화 | 성과 우수 | 중단 검토 | 추가 관찰 | 데이터 부족
소재 피로도 의심 | 비용 대비 구매 기여↑ | 비용 대비 매출 기여↑ | 성과 하락 폭 큰 광고
(순위는 최소 데이터 조건 충족 광고만 포함)
```

---

## 10. 데이터베이스 스키마 초안 (Supabase PostgreSQL)

원본 데이터는 보존하고 지표는 원본에서 재계산 가능하게 설계. 모든 사용자 데이터 테이블에 **RLS 적용**.

### 사용자·권한
- **profiles** `(id PK=auth.users.id, email, display_name, is_active, created_at)`
- **user_roles** `(user_id FK, role: 'admin'|'member')`
- **user_business_access** `(user_id FK, business_portfolio_id FK, access_type: 'owner'|'shared')`
- **user_ad_account_access** `(user_id FK, ad_account_id FK, access_type)`
- **user_preferences** `(user_id PK, last_portfolio_id, last_ad_account_id, last_campaign_id, last_ad_set_id, last_ad_id, date_range jsonb, compare_scope, view_mode, updated_at)`

### Meta 연결·자산 (System User 토큰 방식)
- **meta_connections** `(id, name, system_user_token[암호화/서버전용], api_version, status, created_at)` — 클라이언트 노출 금지, Service Role로만 접근.
- **business_portfolios** `(id PK=meta business id, meta_connection_id FK, name, created_at)`
- **ad_accounts** `(id PK=act_xxx, business_portfolio_id FK, name, currency, timezone_name, status, last_synced_at)`
- **campaigns** `(id PK, ad_account_id FK, name, status, objective, created_time)`
- **ad_sets** `(id PK, campaign_id FK, name, status, created_time)`
- **ads** `(id PK, ad_set_id FK, creative_id FK, name, status, created_time, effective_status)`
- **creatives** `(id PK, ad_id FK, type: image|video|carousel|other, thumbnail_url, preview_url, video_id)`

### 성과 데이터 (원본)
- **daily_insights** `(id, date, ad_account_id, campaign_id, ad_set_id, ad_id, spend, impressions, reach, link_clicks, landing_page_views, purchases, purchase_value, currency, attribution_setting, is_conversion_data_complete bool, created_at, updated_at, UNIQUE(ad_id, date, attribution_setting))`
- **video_insights** `(id, date, ad_id, video_3_second_plays, video_50_percent_plays, video_100_percent_plays, is_video_data_complete bool, created_at, updated_at, UNIQUE(ad_id, date))`
- **conversion_actions** `(id, date, ad_id, action_type, value, count)` — 전환 세부(구매 외 확장 대비)

### 분석·설정·보고
- **analysis_settings** `(id, ad_account_id FK, target_cpa, target_roas, base_ctr, base_cpc, base_landing_rate, base_landing_cost, base_purchase_rate, base_hook_rate, base_hold_rate, base_completion_rate, min_spend, min_impressions, min_link_clicks, min_landing_views, min_purchases, base_observation_days, extra_observation_days, fatigue_frequency, attribution_window, updated_at)` — **기준값 코드 고정 금지, 계정별 설정.**
- **analysis_results** `(id, ad_id, period_start, period_end, verdict_code, confidence, data_sufficiency, metrics jsonb, diagnostics jsonb, data_hash, settings_hash, computed_at, UNIQUE(ad_id, period_start, period_end, data_hash, settings_hash))`
- **claude_narratives** `(id, ad_id, period_start, period_end, input_hash, narrative jsonb, created_at)` — 재현성·비용 캐시
- **generated_reports** `(id, user_id, ad_id, format, options jsonb, storage_path, created_at)`
- **sync_logs** `(id, ad_account_id, sync_type, range_start, range_end, status, error_summary, rows_upserted, started_at, finished_at)`

---

## 11. 인증 및 권한 구조

- **인증**: Supabase Auth email/password. 관리자 사전 등록, 신규 가입 비활성화.
- **세션**: `@supabase/ssr` — 미들웨어에서 쿠키 기반 세션 갱신, 서버 컴포넌트/Route Handler에서 재검증.
- **권한 모델**: 사용자 → `user_ad_account_access` → 접근 가능한 광고계정 화이트리스트. 모든 데이터 API는 세션 재검증 + 해당 계정 접근 권한 확인 후 응답.
- **RLS**: profiles/preferences/access 테이블은 `auth.uid()` 기준. 자산·insights 테이블은 사용자가 접근 가능한 `ad_account_id`로 제한하는 정책(권한 조인). Service Role은 서버 동기화 전용.
- **토큰 보안**: Meta System User 토큰과 Claude/Service Role 키는 **서버 환경변수/암호화 저장**, 클라이언트 절대 노출 금지. 오류 메시지·로그에 토큰/개인정보 미기록.

---

## 12. Meta Marketing API 필드 매핑 초안

> Meta Insights API에서 직접 제공하는 필드와 `actions`/`action_values` 배열에서 추출하는 값을 구분. **Meta 미제공 계산 지표는 서버 계산.** 임의 데이터 생성 금지. (실제 필드명·action_type은 6단계 구현 시 사용 API 버전으로 재검증.)

| 우리 원본 필드 | Meta 소스 | 비고 |
|---|---|---|
| spend | `spend` | |
| impressions | `impressions` | |
| reach | `reach` | |
| link_clicks | `inline_link_clicks` | 전체 클릭(`clicks`) 아님 |
| landing_page_views | `actions[action_type=landing_page_view].value` | 픽셀 필요 |
| purchases | `actions[action_type=purchase 또는 offsite_conversion.fb_pixel_purchase].value` | attribution 영향 |
| purchase_value | `action_values[action_type=purchase].value` | 통화 확인 |
| currency | `account_currency` | 계정별 |
| frequency(참고) | `frequency` | =impressions/reach, 서버 재계산도 가능 |
| video_3_second_plays | `actions[video_view]` 또는 `video_3_sec_watched_actions` | 버전별 명칭 확인 |
| video_50_percent_plays | `video_p50_watched_actions` | |
| video_100_percent_plays | `video_p100_watched_actions` | |

**자산 조회 엔드포인트:** `/{business}/owned_ad_accounts`·`client_ad_accounts`, `/{ad_account}/campaigns`, `/adsets`, `/ads`, `/adcreatives`, `/insights` (level=ad, time_increment=1, action_attribution_windows 지정). 페이지네이션(`paging.next`) 처리 필수.

---

## 13. 지표 계산 규칙 (서버 계산)

| 지표 | 계산식 | 방향(개선) |
|---|---|---|
| CPM | 광고비 ÷ 노출 × 1000 | 낮을수록 ↑ |
| 빈도 | 노출 ÷ 도달 | 단독 판정 안 함 |
| CTR | 링크클릭 ÷ 노출 × 100 | 높을수록 ↑ |
| CPC | 광고비 ÷ 링크클릭 | 낮을수록 ↑ |
| 랜딩 도달률 | 랜딩조회 ÷ 링크클릭 × 100 | 높을수록 ↑ |
| 랜딩 조회당 비용 | 광고비 ÷ 랜딩조회 | 낮을수록 ↑ |
| 구매 전환율 | 구매수 ÷ 랜딩조회 × 100 | 높을수록 ↑ |
| CPA | 광고비 ÷ 구매수 | 낮을수록 ↑ |
| 객단가 | 구매매출 ÷ 구매수 | 높을수록 ↑ |
| ROAS | 구매매출 ÷ 광고비 × 100 | 높을수록 ↑ |
| 후킹률 | 3초재생 ÷ 노출 × 100 | 높을수록 ↑ |
| 유지율 | 50%재생 ÷ 3초재생 × 100 | 높을수록 ↑ |
| 완주율 | 100%재생 ÷ 3초재생 × 100 | 높을수록 ↑ |
| 광고비 비중 | 광고비 ÷ 범위 전체 광고비 × 100 | — |
| 구매 기여도 | 구매수 ÷ 범위 전체 구매수 × 100 | 높을수록 ↑ |
| 매출 기여도 | 구매매출 ÷ 범위 전체 매출 × 100 | 높을수록 ↑ |
| 구매기여-비중 차 | 구매기여도 − 광고비비중 | 양수 = 효율↑ |
| 매출기여-비중 차 | 매출기여도 − 광고비비중 | 양수 = 효율↑ |
| 증감률 | (현재−이전) ÷ 이전 × 100 | 지표별 방향 |

**예외 처리(필수):** 분모 0 → "계산 불가"; 구매 0 → CPA를 0원 표기 금지("구매 없음"); 매출 없음 → ROAS 계산 불가; 이전값 0 → 무한대 금지("신규 발생"); 이전 데이터 없음 → "이전 데이터 없음"; 전환 누락 ≠ 실제 0건 구분(완전성 플래그); 부분 수집 → 경고; 통화 확인; 이미지/캐러셀에 영상지표 0% 금지 → "적용 대상 아님", 영상인데 누락 → "데이터 없음"; attribution 차이 표기.

**빈도 복합 규칙:** 빈도↑ + CTR↓ + CPC↑ + CPA↑ + 구매전환율↓ + ROAS↓ 동시 발생 시 소재 피로도 가능성 표시(단독 금지).

---

## 14. 성과 판정 규칙 초안 (규칙 엔진)

**판정 상태(내부 코드):** `scale_candidate`(확장 후보) · `keep`(유지) · `monitor`(추가 관찰) · `pause_candidate`(중단 검토) · `data_insufficient`(데이터 부족) · `creative_fatigue`(소재 피로도) · `creative_issue`(소재 문제) · `landing_issue`(랜딩 문제) · `tracking_issue`(전환 측정 문제).

**분석 순서(스펙 27):** 노출비용 → 링크클릭 유도 → 랜딩 도달 → 구매 → 매출 효율 → 영상 유지 → 기여도 → 이전 대비 개선 → 데이터 충분도.

**판정 파이프라인(우선순위):**
1. **데이터 충분도 먼저** — min_spend/min_impressions/min_link_clicks/min_landing_views 미달 또는 집행일 < base_observation_days → `data_insufficient` (우수/저성과 단정 금지).
2. **전환 측정 문제** — 클릭·랜딩 정상인데 구매만 비정상 누락 / 구매수-매출 관계 이상 / Meta-DB 불일치 / 특정일만 누락 / attribution 변경 → `tracking_issue` (성과저하로 단정 전에 측정 확인 우선).
3. **랜딩 문제** — CTR 기준 이상 + 클릭 충분 + 랜딩 도달률 낮음 + 랜딩 조회당 비용 높음 → `landing_issue`.
4. **소재 문제** — CPM 평균권 + CTR 낮음 + CPC 높음 + 후킹률 낮음 → `creative_issue`.
5. **구매 전환 문제** — 랜딩 정상 + 조회 충분 + 구매전환율 낮음 + CPA 높음 + ROAS 낮음 → (전환효율 점검 표시).
6. **소재 피로도** — 빈도↑·CTR↓·CPC↑·후킹률↓·구매전환율↓·CPA↑·ROAS↓ + 이전 대비 하락 복합 → `creative_fatigue`.
7. **성과 우수** — CPA ≤ 목표, ROAS ≥ 목표, 기여도 양호 → `scale_candidate` 또는 `keep`.
8. **애매** → `monitor` (extra_observation_days 추가 관찰).

**원칙:** 원인 확정 금지("가능성/의심/확인 필요/단정 어려움" 표현). 동일 데이터 → 동일 1차 판정(결정론적). 기준값은 `analysis_settings`에서 계정별 조정. 예산 미소진 광고를 저성과로 단정하지 않음.

**Claude 역할:** 규칙 엔진의 구조화 결과(JSON)를 받아 한국어 서술문·공유용 요약만 생성. 숫자 생성/계산 금지, 미입력 원인 생성 금지, 근거 수치 포함, JSON 스키마 서버 검증, 실패 시 규칙 엔진 기반 기본 문구 표시.

---

## 15. 개발 단계 세부 체크리스트

**1단계 · 기획/설계 (현재)** — [x] 파일 구조 확인 · 요구사항/충돌 분석 · 사용자 흐름 · 정보구조 · 와이어프레임 · 인증/권한 · DB 스키마 · Meta 매핑 · 지표규칙 · 판정엔진 · 체크리스트 · 위험요소 → PLAN.md 저장.

**2단계 · 샘플 데이터 UI** — 스택 초기화(Next.js App Router + TS + Tailwind + shadcn/ui + Recharts) · 목업 데이터(포트폴리오 2+, 계정 다수, 캠페인/세트/광고 5+, 이미지/영상/데이터부족/전환누락/우수/중단검토 케이스) · 전 화면 흐름 · 배지/툴팁/로딩·오류 상태 · 반응형(1440px 우선).

**3단계 · 로그인/인증** — Supabase Auth · 이메일/비번 로그인 · 자동 로그인/세션 갱신 · 보호 페이지/서버 API · 로그인 계정 변경 · 로그아웃 · 다탭 동기화 · 내부 사용자 제한 · 계정별 접근 권한 · 인증 테스트(스펙 45의 17항목).

**4단계 · 지표/판정 엔진** — 계산 함수 · 예외 처리 · 이전 기간 비교 · 기여도 계산 · 규칙 판정 · **Vitest 단위 테스트** · 동일 데이터 결과 일관성 검증.

**5단계 · Supabase DB** — 테이블/마이그레이션 · RLS 정책 · upsert(중복 방지) · 조회 · user_preferences 저장.

**6단계 · Meta Marketing API** — System User 토큰 서버 연동 · 자산 조회(포트폴리오/계정/캠페인/세트/광고/소재) · 일별·영상 insights · 페이지네이션 · 오류/Rate limit/재시도 · 증분 동기화 · sync_logs · 중복 저장 방지 · 타임존/통화/attribution 처리.

**7단계 · Claude API** — 규칙 결과 전달 · 상세 분석문/공유용 요약 생성 · JSON 스키마 검증 · 숫자 생성 방지 · 캐싱(재현성) · 실패 시 기본 문구.

**8단계 · 보고서/자동 동기화** — PDF/엑셀/CSV 내보내기 · Vercel Cron 일별 동기화 · 실패 기록 · 마지막 업데이트 표시.

---

## 16. 보안 위험 요소

- Meta System User 토큰 유출 시 다수 계정 노출 → 서버 전용 저장·암호화, Service Role로만 접근, 클라이언트/로그/오류메시지 노출 금지.
- Supabase Service Role Key / Claude Key 클라이언트 노출 위험 → 서버 환경변수만 사용.
- RLS 미설정 시 타 사용자 데이터 접근 위험 → 모든 사용자 데이터 테이블 RLS + 서버 API 권한 재검증.
- 보호 페이지 클라이언트 검사만 의존 시 우회 위험 → 서버 세션 재검증 필수.
- 계정 변경 시 이전 사용자 캐시 잔존 → signOut에서 전 캐시 무효화.
- `.env` Git 커밋/토큰 로깅 위험 → `.gitignore` + 로깅 필터.

## 17. 기술 위험 요소

- **Meta API Rate limit / 대용량 페이지네이션** → 백오프·증분·야간 배치.
- **Attribution/타임존/통화 불일치**로 지표 왜곡 → 설정 저장·화면 표기·계정 내 집계 원칙.
- **전환/영상 데이터 부분 누락** → 완전성 플래그로 실제 0과 구분, 성과 단정 방지.
- **분석 재현성** → 규칙 엔진 결정론 + Claude 캐싱(입력 해시).
- **하이브리드 계산 정합성** → 온디맨드 판정과 야간 사전계산 결과가 어긋나지 않도록 동일 함수 공유, `data_hash`로 캐시 무효화.
- **Claude 응답 스키마 위반/실패** → 서버 스키마 검증 + 규칙 엔진 폴백 문구.
- **Meta 필드명 버전 차이** → API 버전 단일 환경변수 관리, 6단계에서 실제 매핑 재검증.
- **6개+ 광고/대량 캠페인 UI 성능** → 가상 스크롤·페이지네이션.

---

## 18. 검증(향후 구현 시)

- 지표 계산: Vitest로 정상/예외(분모 0, 구매 0, 이전값 0, 데이터 누락, 영상 미적용) 케이스 단위 테스트, 동일 입력 → 동일 판정 스냅샷.
- 인증: 스펙 45의 17개 시나리오(새로고침·재시작 유지, 토큰 만료 갱신, 로그아웃 후 접근/뒤로가기 차단, 다탭 동기화, 계정 변경 격리, 서버 API 차단).
- UI: 스펙 46의 케이스(포트폴리오/계정 다수, 광고 6개+, 긴 이름, 데이터/이전기간/구매/매출 없음, 삭제 항목, Meta 실패 시 과거 데이터 유지, 1440px).

---

## 다음 단계에서 구현할 기능 (2단계)

**PLAN.md 저장 완료 → 2단계(샘플 데이터 UI)**부터 시작: Next.js 스택 초기화 후, 가짜 데이터로 로그인/광고계정 선택/3단 탐색/광고 상세 전 화면 흐름과 로딩·오류 상태를 구현(Meta/Supabase/Claude 미연결).
