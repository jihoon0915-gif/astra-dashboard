# ko-lettucedetect 기존 통합 UI에 연결

저장소: https://github.com/YangNaang2/ko-lettucedetect

`feature/astra-evidence-graph-v1`의 `demo-ui/spatial-poc/integrated_server.py`와 `detector_bridge.py`는 이 체크포인트 형식을 이미 지원합니다.

1. 이 ZIP을 풀고 `model` 폴더의 절대 경로를 확인합니다.
2. 저장소의 `work/astra.env` 같은 Git 제외 환경 파일에 아래 값을 지정합니다.

```text
ASTRA_DETECTOR_PATH=/압축을_푼_절대경로/model
ASTRA_DETECTOR_THRESHOLD=0.5
ASTRA_DETECTOR_LENGTH=512
ASTRA_DETECTOR_AGG=min
ASTRA_DETECTOR_DEVICE=cuda
```

3. 기존 생성 모델·색인이 준비된 PC에서 저장소 루트 기준으로 실행합니다.

```text
python demo-ui/spatial-poc/integrated_server.py --env-file work/astra.env --generator model --index /기존/index.sqlite --port 8769
```

모델 없는 UI 작업은 기존 `--generator disconnected` 모드를 계속 사용할 수 있습니다. 세 탐지기를 동시에 적재하지 않습니다. 이 패키지는 BGE-M3 하나를 적재합니다.

별도 API 방식이 필요하면 이 패키지의 `server.py`를 실행하고 프론트엔드에서 `POST http://127.0.0.1:18768/detect`를 호출합니다. 브라우저 배포 서버에서 사용자 PC의 localhost를 호출하는 구조라면, 각 사용자 PC에도 이 모델 서버가 실행 중이어야 합니다.
