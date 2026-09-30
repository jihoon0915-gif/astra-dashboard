# ASTRA BGE-M3 환각 탐지기 · UI 팀 전달본

이 ZIP은 **검색용 원본 BAAI/bge-m3 임베딩 모델이 아니라**, ASTRA에서 답변의 근거 불일치 의심 구간을 찾도록 추가 학습한 `XLMRobertaForTokenClassification` 체크포인트입니다.

## 구성

- `model/`: 체크포인트와 토크나이저 4개 파일
- `server.py`, `detector_runtime.py`: 모델을 한 번만 GPU/CPU에 적재하는 로컬 HTTP API
- `example.html`: 브라우저 연동 예제
- `ASTRA_기존_UI_연결.md`: 저장소의 통합 UI에 직접 연결하는 방법
- `manifest.json`, `SHA256SUMS.txt`: 파일·모델 식별 및 무결성 확인
- `smoke_result.json`: 이 워크스테이션의 RTX A5000 실제 로드 결과

## 가장 빠른 실행

Python 3.10 이상을 권장합니다. CUDA PC에서는 GPU와 맞는 PyTorch를 먼저 설치한 뒤:

```text
python -m venv .venv
# Windows: .venv\Scripts\activate
# Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
python server.py --device cuda --port 18768
```

GPU가 없으면 `--device cpu`로 실행할 수 있지만 BGE-M3 대형 체크포인트라 느립니다. 서버가 뜨면 다음 주소를 확인합니다.

```text
http://127.0.0.1:18768/health
```

`example.html`을 브라우저에서 열고 **검사**를 누르면 `/detect` 연동을 볼 수 있습니다.

## API

`POST http://127.0.0.1:18768/detect`

```json
{
  "question": "예산과 제출 마감은?",
  "context": "사업 예산은 부가세 포함 7천만원이다. 제출 마감은 5월 15일이다.",
  "answer": "이 사업의 예산은 9억원이며 제출 마감은 7월 30일입니다."
}
```

응답의 `spans`는 `start` 포함, `end` 미포함인 **Python/Unicode code point 기준**입니다. 브라우저 JavaScript에서 이모지처럼 UTF-16 두 칸을 쓰는 문자가 포함되면 코드포인트→UTF-16 offset 변환이 필요합니다. ASTRA 기존 UI는 저장소의 검증된 연결 코드를 사용하는 편이 안전합니다.

## 해석 주의

- `MODEL_SUSPECT`는 근거 불일치 **의심 구간**이며 확정 판정이 아닙니다.
- 기본 `threshold=0.5`, `aggregation=min`, `max_length=512`는 연결용 설정입니다. 조달 도메인 운영 임계값으로 최종 보정된 값이 아닙니다.
- 이 패키지의 스모크 통과는 모델 로드·추론·offset 연결 확인입니다. 정확도·F1 성능을 뜻하지 않습니다.
- 질문, 실제 검색 근거, 생성 답변의 세 값을 함께 보내야 합니다. 정답 라벨이나 기대 답변을 입력하지 않습니다.
- 모델 가중치는 Git에 올리지 말고 승인된 파일 전달 수단으로 공유합니다.

## 수신 확인

Linux/macOS:

```text
sha256sum -c SHA256SUMS.txt
```

Windows PowerShell에서는 아래 모델 해시가 `manifest.json`과 같은지 확인합니다.

```powershell
(Get-FileHash .\model\model.safetensors -Algorithm SHA256).Hash.ToLower()
```

정상 모델 SHA-256:

```text
8ac451a22ffbcbc25d121d9f4f3a4caac18f780692cb966fd2860c7d68314217
```
