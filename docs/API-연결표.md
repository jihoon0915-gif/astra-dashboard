# 데이터/API 연결표

Python 표준 라이브러리 서버 + 정적 ES module 프런트엔드입니다. 외부 인증 서비스나 브라우저 모의 인증을 사용하지 않습니다. 로컬 서버는 127.0.0.1에만 바인딩합니다.

| API | 실제 계약 / 사용 화면 |
|---|---|
| GET /api/session | `{user}`. 서버 쿠키에서 만료/계정 재확인. 모든 라우트와 탭 복귀 |
| POST /api/login | `{company_code, employee_id, password}`. 저장 계정 PBKDF2 검증, HttpOnly/SameSite=Strict 8시간 쿠키. 로그인 |
| POST /api/logout | `{}`. 서버 토큰 제거·쿠키 만료. 개인 화면 메모리 정리 |
| GET /api/bootstrap | `{user, companies, notices, regions, mode, generator_connected}`. 공개 공고와 공개 기업 카탈로그 |
| GET /api/discover | query/sector/region/month/from/to/min/max/condition/review/open/sort/date. min/max 단위 억 원, 최소 이상/최대 미만. 세션에서 회사와 범위 결정 |
| discover 응답 | `items,total,public_total,basis,demo_date,company,documents,scope,rules,events`. 각 item은 기존 공고 필드 + matches/unknowns/open. L1은 company=null, documents=[] |
| GET /api/examples?bid=ID | 허용된 사례의 id/question/source/company_id/levels/bids/bid/detection_kind 목록 |
| GET /api/cases/:id | 원본 answer/answer_sha256/contexts/spans/integrity와 출처. 회사·등급·청크별 권한 확인 |
| GET /api/documents | 허용 문서의 메타데이터. 내부 파일 경로 제거 |
| GET /api/documents/:id | `{metadata,text}`. 회사·등급·역할 검사 후 마크다운 원문 |
| GET/POST /api/personal | favorites/history. POST action: favorite/history/delete_history/clear_history/clear_favorites. tenant_id+employee_id 분리 |
| GET /api/comparison | 현재 회사 L3+can_compare 확인. 동일 notice/question/data_version/basis 및 L1/L2/L3 variants |
| GET /api/status | 실제 연결 상태. 가중치 보유를 검증 없이 주장하지 않도록 문구 수정 |
| GET /api/research | 별도 Bearer 연구원 키 + 자사 L3 세션. 자사 허용 curated 항목과 사람 검수 제안 반환. evidence/manifest의 등급·회사도 검사. 타사 원장 미노출 |

## 원본 자료

- `legacy-source/demo-ui/spatial-poc/dist/public-notices.json`: 51건 공고. id/title/agency/budget/month/sector/deadline/url/attachmentCount/requirements/reviewAvailable/conditionMentions.
- `private/corpus.sqlite`: 원문 청크. 문서/청크/회사/보안등급/문자 범위/텍스트.
- `private/companies/public/companies_catalog.json`: 합성 회사 공개 프로필. region/specialties를 조건 설명에 사용.
- `private/companies/internal/manifests/`: 문서 접근 조건. allowed_roles/security_level/tenant_id를 유지.
- `private/curated.json`: 저장 출력과 탐지 정보. 100건의 텍스트·해시 매핑을 원본과 대조.
- `private/editorial.json`: 시연용 작성 답변. 새 모델 출력으로 표시하지 않음.
- `private/user-state.sqlite`: 실행 PC별 개인 기록. 공유 패키지·Git 제외.

## 명확한 경계

전문분야 단어가 공고 제목에 있는지와 기관명 추정 지역만 계산합니다. 이것은 내부 증빙 검증·자격 판정·AI 유사도·합격 확률이 아닙니다. 요건과 회사 문서의 직접 매핑이 없으면 미확인으로 표시합니다. 회사 규모를 예산 선호로 바꾸지 않습니다.

Hash route를 사용하므로 서버의 별도 SPA fallback 없이 새로고침 가능합니다. 공고 ID는 원본 ID를 유지합니다. 이전 질문을 열 때 cases API가 현재 권한을 다시 검사합니다. 검색 요청 순번으로 오래된 결과를 버리고, 라우트 epoch와 AbortController로 답변의 늦은 응답을 방지합니다.
