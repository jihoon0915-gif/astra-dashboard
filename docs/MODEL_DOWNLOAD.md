# 모델 포함 원본 ZIP 내려받기

[Blue Jay 최종 배포 Release](https://github.com/jihoon0915-gif/astra-dashboard/releases/tag/bluejay-final-20260923)의 Assets에서 다음 파일을 모두 같은 폴더에 내려받으세요.

- `BlueJay_full_20260923.zip.part01`부터 `BlueJay_full_20260923.zip.part06`까지 6개
- `BlueJay_package_manifest.json`
- `restore_model_package.py`

원본 약 11.10GB ZIP을 GitHub Release의 파일별 제한에 맞추어 분할했습니다. 6개 조각을 모두 받아야 하며 각 조각을 따로 압축 해제할 수 없습니다. 이 파일들은 원본 ZIP의 바이트를 순서대로 나눈 것이므로 아래 복원 결과는 원본과 동일합니다.

Python 3.11 이상을 준비한 뒤 다운로드 폴더에서 실행합니다.

```bash
python restore_model_package.py
```

다른 폴더에 파일을 받은 경우 경로를 지정할 수 있습니다.

```bash
python restore_model_package.py "다운로드 폴더 경로"
```

복원 프로그램은 조각별 크기와 SHA-256, 합쳐진 ZIP 전체의 크기와 SHA-256을 확인합니다. 기존 파일은 덮어쓰지 않습니다. 완료하면 `Blue_Jay_최종배포_수정반영_모델포함_20260923.zip`이 생성됩니다.

분할 파일 보관, ZIP 복원, 전체 압축 해제를 같은 디스크에서 진행하려면 총 약 34GB의 여유 공간을 준비하세요. 다운로드 폴더에서 ZIP 복원까지는 약 22.2GB를 사용합니다.

## 최신 저장소 코드에 모델 추가

1. 저장소를 복제하거나 최신 `main`을 받습니다.
2. 복원한 ZIP에서 `ASTRA-Weevolve/runtime/`을 저장소 루트의 `runtime/`에 복사합니다.
3. [MODEL_SETUP.md](../MODEL_SETUP.md)에 따라 Ollama와 Python 의존성을 설치하고 실행합니다.

Release의 분할 ZIP은 사용자가 제공한 모델 포함 원본 배포본입니다. 저장소에는 WebM 대체 영상과 글꼴 라이선스 링크의 응답 보완이 추가되어 있으므로, 최신 실행 코드는 저장소와 함께 사용하세요. Python과 Ollama 실행 파일은 원본 ZIP에 포함되지 않습니다.

시연 영상은 저장소의 [사운드 포함 최종 영상](demo/BlueJay_demo_v5_사운드.mp4)과 Release의 `BlueJay_demo_v5_sound.mp4`에서 받을 수 있습니다.
