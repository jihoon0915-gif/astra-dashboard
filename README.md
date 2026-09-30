# Blue Jay · ASTRA Dashboard

공공 입찰 공고를 탐색하고, 회사·역할별로 허용된 근거를 바탕으로 AI 답변과 환각 의심 구절을 확인하는 로컬 시연 대시보드입니다.

현재 기본 실행 화면은 **2026-09-23 수정 반영 최종 UI**입니다. `Blue_Jay_최종배포_수정반영_모델포함_20260923.zip`의 소스를 저장소 루트에 반영했습니다. 이전 `ASTRA_BIRDv1/`, `ASTRA_BIRDv2/`와 기존 Git 이력은 보존합니다.

## 시연 영상

[▶ Blue Jay 최종 시연 영상 v5 · 사운드 포함](docs/demo/BlueJay_demo_v5_사운드.mp4)

약 70초, 1920×1080, H.264 영상과 AAC 오디오입니다. GitHub에서 미리보기가 표시되지 않으면 영상 파일의 **Download raw file**을 눌러 내려받으세요.

## 빠른 실행

Python 3.11을 권장합니다. 저장 답변 시연은 Python 표준 라이브러리만으로 실행할 수 있습니다.

```bash
git clone https://github.com/jihoon0915-gif/astra-dashboard.git
cd astra-dashboard
python setup_data.py
python launch.py
```

Windows에서는 `START_ASTRA_V3.cmd`, macOS/Linux에서는 `sh start_astra_v3.sh`로도 실행할 수 있습니다. macOS/Linux에서 `python`이 없다면 `python3`을 사용하세요.

기본 주소는 `http://127.0.0.1:8773`이며 포트가 사용 중이면 다음 빈 포트를 선택합니다. 실행 창에 표시된 주소를 사용하고 시연 동안 창을 열어 두세요. 공고·회사 데이터 ZIP과 합성 사용자 DB가 저장소에 포함되어 있어 별도 데이터 다운로드가 필요 없습니다. 처음 실행하면 `private/`에 작업용 데이터가 준비됩니다.

## 로그인과 권한

- 회사: `C01`
- 사용자명: `c01_bid_approver`
- 공통 시연 비밀번호: `000000`
- 전체 합성 계정표: [DEMO_LOGIN_ACCOUNTS.csv](user-db/DEMO_LOGIN_ACCOUNTS.csv)

5개 회사의 25개 합성 계정 중 20개가 활성 상태입니다. 이전 사번 `C01-2001` 대신 사용자명을 선택하세요. 기본 시연 기준일은 `2026-05-11`입니다.

| 역할 | 접근 범위 |
|---|---|
| `viewer` | 공개 L1 자료 |
| `bid_analyst` | 공개 L1 및 자사 L2 자료 |
| `cost_analyst` | 자사 L2 및 허용된 L3 원가·견적 자료 |
| `bid_approver` | 자사 L1·L2·L3 자료 |

문서별 허용 역할과 종류 제한도 함께 적용합니다. 서버는 요청마다 계정·소속·역할을 다시 확인하며, 비활성 계정은 로그인할 수 없습니다. 개인 기록과 생성 답변은 사용자별로 분리합니다. 모든 사용자·회사 자료는 로컬 시연용 합성 데이터입니다.

## 실제 모델로 질문하기

예시 질문 버튼은 저장 답변을 재생합니다. 직접 입력한 질문은 **Qwen3 8B / 4B / 1.7B Q4_K_M** 중 선택한 모델로 생성하고 **BGE-M3 토큰 분류 모델**로 검사합니다.

AI 모델 가중치 약 11GB는 일반 Git 파일 크기 제한 때문에 소스 커밋에서 제외하고 [최종 배포 Release](https://github.com/jihoon0915-gif/astra-dashboard/releases/tag/bluejay-final-20260923)에 모델 포함 원본 ZIP을 6개 조각으로 제공합니다. 다운로드와 복원 방법은 [모델 다운로드 안내](docs/MODEL_DOWNLOAD.md)를 참고하세요. 원본 ZIP이 준비되면 다음과 같이 실행 환경을 설정합니다.

1. `Blue_Jay_최종배포_수정반영_모델포함_20260923.zip`의 `ASTRA-Weevolve/runtime/` 폴더를 이 저장소의 `runtime/`에 복사합니다.
2. Python 3.11과 Ollama를 설치합니다. Python·Ollama 실행 파일은 원본 ZIP에도 포함되지 않습니다.
3. 해당 Python으로 의존성을 설치하고 실행합니다.

```bash
python -m pip install -r requirements-live.txt
python launch.py
```

실행기는 `127.0.0.1:11435`의 별도 Ollama 서비스를 사용합니다. Qwen 생성 후 모델을 메모리에서 내리고 BGE 검사를 순차 실행합니다. 모델이 없는 소스 체크아웃에서는 저장 답변 시연을 사용할 수 있습니다.

설치 조건, 모델 해시, 처리 범위는 [MODEL_SETUP.md](MODEL_SETUP.md)를 참고하세요. 원본 ZIP 구성과 파일별 SHA-256은 [PACKAGE_MANIFEST.json](PACKAGE_MANIFEST.json), 이번 반영 내역은 [final-import.json](evidence/final-import.json)에 있습니다. `PACKAGE_MANIFEST.json`은 **원본 배포 ZIP 기준**이며, 저장소용으로 수정한 README·Git 설정 파일의 현재 해시를 나타내지는 않습니다.

## 주요 구성

- `public/`: 최종 Blue Jay 화면, 스타일, 글꼴, 이미지, 전환 영상.
- `server.py`, `user_auth.py`: API, 로그인, 회사·역할·문서 접근 제어.
- `discovery.py`, `live_models.py`: 공고 탐색, 권한 내 근거 검색, 모델별 답변 생성.
- `runtime/bge-detector/`: 탐지기 런타임과 설정. 대용량 모델 가중치는 별도 준비.
- `downloads/ASTRA-demo-data-v1.zip`: 해시로 검증하는 합성 공고·회사 데이터.
- `user-db/`: 시연용 사용자 DB와 계정표.
- `docs/demo/`: 최종 시연 영상.
- `private/`: 실행 시 생성되는 데이터·개인 기록·키. Git 추적 제외.
- `docs/`, `evidence/`: 구현 문서와 검증 기록. 과거 기록의 로컬 경로·버전·성능 수치는 당시 환경 기준.

## 검증

데이터 준비 후 다음 검증을 실행합니다. JavaScript 검증에는 Node.js가 필요합니다.

```bash
python -m unittest test_user_db test_live_models -v
node test_bluebird.mjs
node test_dates.mjs
node test_live_spans.mjs
node test_ui.mjs
node test_typewriter.mjs
```

계정 25개의 접근 범위, 권한 변경·비활성화, 개인 기록 분리, 근거 검색, 세 모델의 생성 요청 연결, 날짜 처리, 답변 렌더링과 한글·이모지 강조 위치를 확인합니다. 생성 연결 테스트는 모델 호출을 대체하므로 실제 모델 추론 검증과 구분하세요.

`test_server.py`, `test_v2.py`, `test_discovery.py`는 이전 사번 인증을 사용하는 과거 테스트입니다. 현재 로그인 계약은 `test_user_db.py`로 검증합니다.

## 범위와 기록

공개 공고 51건, 회사 문서 41개, 저장 사례 111건을 유지합니다. 새 질문에는 공고와 자사 근거를 나누어 검색하고, 같은 근거를 생성과 탐지에 전달합니다. 검색은 키워드 기반이며 벡터 검색은 연결하지 않았습니다. 탐지 표시가 없다는 사실은 정답 보증이 아니고, 검사 오류는 미검증으로 표시합니다.

지도·공고 DB 관계도·근거 경로·연구원 전용 화면의 전체 디자인 이식은 원본 최종 배포본에서도 남아 있는 범위입니다. 추가 설명은 [원본 배포 README](docs/final-package-originals/README.md), [변경 기록](CHANGELOG.md), [출처와 라이선스](docs/출처와-라이선스.md)를 참고하세요.
