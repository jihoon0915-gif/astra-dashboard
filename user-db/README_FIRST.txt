ASTRA 합성 사용자 DB v1

- 총 25계정: 회사 5곳 x (viewer, bid_analyst, cost_analyst, bid_approver, inactive)
- 로그인 ID: DEMO_LOGIN_ACCOUNTS.csv 참고
- 공통 개발용 암호: 000000
- users.demo.sqlite3에는 평문 암호가 아니라 PBKDF2-SHA256 해시만 저장됨
- 모든 계정과 회사는 합성 자료이며 로컬 UI 시연 전용

권한 규칙
- viewer: L1 공개 공고만
- bid_analyst: 자기 회사 L1/L2
- cost_analyst: 자기 회사 L1/L2와 L3 원가·견적
- bid_approver: 자기 회사 L1/L2/L3 전체
- inactive: 올바른 암호여도 로그인/문서 접근 거절

로그인 처리 기준
1. username으로 사용자를 찾고 PBKDF2-SHA256으로 암호를 검증한다.
2. account_status=active와 membership_active=true를 모두 확인한다.
3. 서버 세션에는 user_id만 저장하고, 매 요청마다 DB의 tenant_id와 role을 다시 적용한다.
4. 같은 역할이어도 다른 tenant의 L2/L3 문서는 거절한다.

주의
- 브라우저가 보내는 role, tenant_id, security_level은 권한 판단에 사용하지 않는다.
- 이 DB와 공통 암호는 로컬 UI 시연 전용이며 실제 서비스 인증 DB로 사용하지 않는다.
