"""Offline BGE-M3 token-classification runtime for ASTRA UI integration."""
from __future__ import annotations

import hashlib
import json
import threading
from pathlib import Path

import numpy as np
import torch
from transformers import AutoModelForTokenClassification, AutoTokenizer


class BgeM3HallucinationDetector:
    """Load once, then compare an answer against a question and evidence context."""

    def __init__(
        self,
        model_dir: str | Path,
        *,
        device: str = "cuda",
        threshold: float = 0.5,
        max_length: int = 512,
        aggregation: str = "min",
    ) -> None:
        self.model_dir = Path(model_dir).resolve()
        self.device = device
        self.threshold = threshold
        self.max_length = max_length
        self.aggregation = aggregation
        self._lock = threading.Lock()
        self._validate()
        self.tokenizer = AutoTokenizer.from_pretrained(
            self.model_dir, local_files_only=True, use_fast=True
        )
        self.model = AutoModelForTokenClassification.from_pretrained(
            self.model_dir, local_files_only=True
        ).to(self.device).eval()
        self.cls_id = self.tokenizer.cls_token_id
        if self.cls_id is None:
            self.cls_id = self.tokenizer.bos_token_id
        self.sep_id = self.tokenizer.sep_token_id
        if self.sep_id is None:
            self.sep_id = self.tokenizer.eos_token_id
        self.n_special = int(self.cls_id is not None) + 2 * int(self.sep_id is not None)
        self.weight_sha256 = self._sha256(self.model_dir / "model.safetensors")

    @staticmethod
    def _sha256(path: Path) -> str:
        digest = hashlib.sha256()
        with path.open("rb") as stream:
            for block in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(block)
        return digest.hexdigest()

    def _validate(self) -> None:
        required = [
            "config.json", "tokenizer.json", "tokenizer_config.json", "model.safetensors"
        ]
        missing = [name for name in required if not (self.model_dir / name).is_file()]
        if missing:
            raise FileNotFoundError(f"Missing model files: {', '.join(missing)}")
        cfg = json.loads((self.model_dir / "config.json").read_text(encoding="utf-8"))
        if cfg.get("id2label") != {"0": "SUPPORTED", "1": "HALLUCINATED"}:
            raise ValueError("Checkpoint label mapping must be 0=SUPPORTED, 1=HALLUCINATED")
        if not any("TokenClassification" in name for name in cfg.get("architectures", [])):
            raise ValueError("This is not a token-classification checkpoint")
        if self.device not in {"cpu", "cuda"}:
            raise ValueError("device must be cpu or cuda")
        if self.device == "cuda" and not torch.cuda.is_available():
            raise RuntimeError("CUDA requested but torch.cuda.is_available() is false")
        if not 0 < self.threshold < 1:
            raise ValueError("threshold must be between 0 and 1")
        if self.aggregation not in {"min", "min2", "mean"}:
            raise ValueError("aggregation must be min, min2, or mean")
        max_positions = int(cfg.get("max_position_embeddings", self.max_length + 2))
        if self.max_length > max_positions - 2:
            raise ValueError("max_length exceeds checkpoint capacity")

    def _forward(self, prompt_ids: list[int], answer_ids: list[int]) -> np.ndarray:
        ids: list[int] = []
        if self.cls_id is not None:
            ids.append(self.cls_id)
        ids.extend(prompt_ids)
        if self.sep_id is not None:
            ids.append(self.sep_id)
        answer_start = len(ids)
        ids.extend(answer_ids)
        if self.sep_id is not None:
            ids.append(self.sep_id)
        tensor = torch.tensor([ids], device=self.device)
        autocast = self.device == "cuda"
        with torch.inference_mode(), torch.autocast(
            device_type="cuda", dtype=torch.bfloat16, enabled=autocast
        ):
            logits = self.model(input_ids=tensor, attention_mask=torch.ones_like(tensor)).logits
        probs = torch.softmax(logits[0].float(), dim=-1)[:, 1].cpu().numpy()
        return probs[answer_start : answer_start + len(answer_ids)]

    def _aggregate(self, matrix: np.ndarray) -> np.ndarray:
        if len(matrix) == 1 or self.aggregation == "min":
            return matrix.min(axis=0)
        if self.aggregation == "mean":
            return matrix.mean(axis=0)
        if len(matrix) < 2:
            return matrix[0]
        return np.sort(matrix, axis=0)[1]

    def _segment_probs(
        self, context: str, question: str, segment: str
    ) -> tuple[np.ndarray, list[tuple[int, int]], int]:
        encoded = self.tokenizer(
            segment, add_special_tokens=False, return_offsets_mapping=True
        )
        answer_ids = encoded["input_ids"]
        offsets = encoded["offset_mapping"]
        if not answer_ids:
            return np.zeros(0), [], 0
        prompt = f"질문: {question.strip()}\n\n문서:\n{context.strip()}"
        prompt_ids = self.tokenizer(prompt, add_special_tokens=False)["input_ids"]
        budget = self.max_length - len(answer_ids) - self.n_special
        if budget < 64:
            raise ValueError("Answer segment leaves insufficient evidence budget")
        if len(prompt_ids) <= budget:
            return self._forward(prompt_ids, answer_ids), offsets, 1
        stride = max(1, budget // 2)
        rows = []
        for start in range(0, len(prompt_ids), stride):
            chunk = prompt_ids[start : start + budget]
            if not chunk:
                break
            rows.append(self._forward(chunk, answer_ids))
            if start + budget >= len(prompt_ids):
                break
            if len(rows) >= 64:
                break
        return self._aggregate(np.stack(rows)), offsets, len(rows)

    @staticmethod
    def _spans(
        answer: str,
        offsets: list[tuple[int, int]],
        probs: np.ndarray,
        threshold: float,
        base: int,
    ) -> list[dict]:
        spans: list[dict] = []
        current_start = current_end = None
        current_probs: list[float] = []
        for probability, (start, end) in zip(probs, offsets):
            if start == end:
                continue
            if probability >= threshold:
                if current_start is None:
                    current_start, current_end = start, end
                    current_probs = [float(probability)]
                elif start - current_end <= 1:
                    current_end = end
                    current_probs.append(float(probability))
                else:
                    if current_end - current_start >= 2:
                        s, e = base + current_start, base + current_end
                        spans.append({"start": s, "end": e, "quote": answer[s:e],
                                      "probability": max(current_probs)})
                    current_start, current_end = start, end
                    current_probs = [float(probability)]
            elif current_start is not None:
                if current_end - current_start >= 2:
                    s, e = base + current_start, base + current_end
                    spans.append({"start": s, "end": e, "quote": answer[s:e],
                                  "probability": max(current_probs)})
                current_start = current_end = None
                current_probs = []
        if current_start is not None and current_end - current_start >= 2:
            s, e = base + current_start, base + current_end
            spans.append({"start": s, "end": e, "quote": answer[s:e],
                          "probability": max(current_probs)})
        return spans

    def detect(self, *, context: str, question: str, answer: str) -> dict:
        if not isinstance(context, str) or not isinstance(question, str) or not isinstance(answer, str):
            raise TypeError("context, question, and answer must be strings")
        if not answer.strip():
            return self._result([], len(answer), 0)
        full = self.tokenizer(answer, add_special_tokens=False, return_offsets_mapping=True)
        all_offsets = full["offset_mapping"]
        spans: list[dict] = []
        window_count = 0
        with self._lock:
            for index in range(0, len(all_offsets), 192):
                chunk = all_offsets[index : index + 192]
                start, end = chunk[0][0], chunk[-1][1]
                segment = answer[start:end]
                probs, offsets, windows = self._segment_probs(context, question, segment)
                spans.extend(self._spans(answer, offsets, probs, self.threshold, start))
                window_count += windows
        return self._result(spans, len(answer), window_count)

    def _result(self, spans: list[dict], answer_length: int, window_count: int) -> dict:
        for span in spans:
            span.update(
                label="MODEL_SUSPECT",
                reason="BGE-M3 근거 불일치 의심 예측 · 확정 판정 아님",
            )
        return {
            "status": "completed",
            "spans": spans,
            "checked_ranges": [[0, answer_length]],
            "unchecked_ranges": [],
            "window_count": window_count,
            "threshold": self.threshold,
            "aggregation": self.aggregation,
            "threshold_status": "configured_not_calibrated_on_procurement",
            "offset_unit": "unicode_codepoint_end_exclusive",
            "model": {
                "name": "ASTRA BGE-M3 hallucination token classifier",
                "architecture": "XLMRobertaForTokenClassification",
                "weights_sha256": self.weight_sha256,
                "labels": {"0": "SUPPORTED", "1": "HALLUCINATED"},
            },
        }
