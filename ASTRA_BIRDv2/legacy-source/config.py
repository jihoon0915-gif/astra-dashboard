"""공통 설정. 경로와 RAGTruth 필드명만 여기서 관리한다."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data" / "RAGTruth" / "dataset"
WORK_DIR = ROOT / "work"
RUNS_DIR = ROOT / "runs"

SOURCE_INFO_FILE = DATA_DIR / "source_info.jsonl"
RESPONSE_FILE = DATA_DIR / "response.jsonl"

# --- RAGTruth 필드명 -------------------------------------------------------
# `python -m src.prepare_ragtruth --inspect` 로 실제 키를 확인하고, 다르면 여기만 고친다.
FIELD_SOURCE_ID = "source_id"
FIELD_TASK_TYPE = "task_type"
FIELD_SOURCE_INFO = "source_info"
FIELD_PROMPT = "prompt"
FIELD_RESPONSE = "response"
FIELD_LABELS = "labels"
FIELD_SPLIT = "split"
FIELD_MODEL = "model"
FIELD_RESPONSE_ID = "id"

# labels 원소의 키
FIELD_SPAN_START = "start"
FIELD_SPAN_END = "end"
FIELD_SPAN_TEXT = "text"

# --- <HAL> 태그 ------------------------------------------------------------
HAL_OPEN = "<HAL>"
HAL_CLOSE = "</HAL>"

# --- 번역 ------------------------------------------------------------------
# 논문은 gemma-3-27b-it 를 A100 1장(80GB)에서 bf16 으로 돌렸다.
# 우리 워크스테이션은 A5000 1장(24GB)이라 27B bf16(약 54GB)이 들어가지 않는다.
# 기본값을 12B 로 낮추고, 파일럿에서 27B(int4)와 태그 보존율을 비교해 결정한다.
TRANSLATE_MODEL = "google/gemma-3-12b-it"
TRANSLATE_MODEL_PAPER = "google/gemma-3-27b-it"   # 참고용 — 24GB 1장에는 int4 로만 가능
SOURCE_LANG = "English"
TARGET_LANG = "Korean"

# 논문 p.3 "Core Translation Prompt" 를 그대로 옮긴 것. 문구를 바꾸지 말 것.
CORE_TRANSLATION_PROMPT = (
    "Translate the following text from {source_lang} to {target_lang}. If the "
    "original text contains <HAL> tags, translate the content inside <HAL> tags "
    "and ensure the number of the <HAL> tags remain exactly the same in the "
    "output. If the original text does not contain <HAL> tags, just translate the "
    "text. Do NOT add any <HAL> tags if they were not in the original text. Do "
    "NOT remove any <HAL> tags that were in the original text. Do not include "
    "any additional sentences summarizing or explaining the translation. Your "
    "output should be just the translated text, nothing else.\n\n"
    "{text}"
)

# --- 학습 (논문 III-D와 동일) ----------------------------------------------
DEFAULT_ENCODER = "Alibaba-NLP/gte-multilingual-base"
MAX_LENGTH = 4096          # A5000 24GB 기준. 여유가 있으면 8192로 올린다.
NUM_EPOCHS = 6
LEARNING_RATE = 1e-5
PER_DEVICE_BATCH = 1       # grad_accum 4와 합쳐 논문의 유효 배치 4
GRAD_ACCUM = 4

LABEL_SUPPORTED = 0
LABEL_HALLUCINATED = 1
IGNORE_INDEX = -100
