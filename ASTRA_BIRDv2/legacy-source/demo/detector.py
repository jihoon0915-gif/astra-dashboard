"""학습된 탐지기를 실제 문서에 쓰기 위한 래퍼. 데모와 평가② 가 함께 쓴다.

학습 때(`src/dataset.py`)와 **완전히 같은 방식으로 입력을 만든다.** 형식이 조금만
달라져도 성능이 떨어지므로 이 파일을 고칠 때는 `dataset.encode_example` 과 나란히 볼 것.

추가된 것 — **슬라이딩 윈도우.**
klue/roberta-base 와 xlm-roberta-base 는 최대 512 토큰이라 학사요람처럼 긴 문서는
잘린다. 문서를 겹치는 창으로 나눠 각각 돌린 뒤 답변 토큰별 확률의 **최댓값**을 취하면,
재학습 없이도 문서 전체를 근거로 볼 수 있다. "어느 창에서든 근거를 찾으면 지지"가
아니라 "어느 창에서도 환각으로 보이면 환각"이 되지 않도록, 지지 확률 기준으로는
최솟값을 쓰는 셈이다.
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import torch
from transformers import AutoModelForTokenClassification, AutoTokenizer

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import config as C  # noqa: E402


class HalluDetector:
    def __init__(self, run_dir: str, max_length: int = 512, threshold: float = 0.5,
                 device: str | None = None, trust_remote_code: bool = False,
                 agg: str = "min"):
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self.tok = AutoTokenizer.from_pretrained(run_dir, trust_remote_code=trust_remote_code)
        self.model = AutoModelForTokenClassification.from_pretrained(
            run_dir, trust_remote_code=trust_remote_code).to(self.device).eval()
        self.max_length = max_length
        self.threshold = threshold
        self.agg = agg

        self.cls_id = self.tok.cls_token_id if self.tok.cls_token_id is not None else self.tok.bos_token_id
        self.sep_id = self.tok.sep_token_id if self.tok.sep_token_id is not None else self.tok.eos_token_id
        self.n_special = (1 if self.cls_id is not None else 0) + (2 if self.sep_id is not None else 0)

    # ----------------------------------------------------------------- 내부
    def _forward(self, prompt_ids: list[int], ans_ids: list[int]) -> np.ndarray:
        ids = []
        if self.cls_id is not None:
            ids.append(self.cls_id)
        ids += prompt_ids
        if self.sep_id is not None:
            ids.append(self.sep_id)
        start_of_answer = len(ids)
        ids += ans_ids
        if self.sep_id is not None:
            ids.append(self.sep_id)

        t = torch.tensor([ids], device=self.device)
        with torch.no_grad():
            with torch.autocast(device_type="cuda", dtype=torch.bfloat16,
                                enabled=(self.device == "cuda")):
                logits = self.model(input_ids=t,
                                    attention_mask=torch.ones_like(t)).logits.float().cpu()
        prob = torch.softmax(logits[0], dim=-1)[:, C.LABEL_HALLUCINATED].numpy()
        return prob[start_of_answer:start_of_answer + len(ans_ids)]

    # ----------------------------------------------------------------- 공개
    def token_probs(self, context: str, question: str, answer: str,
                    window: bool = True) -> tuple[np.ndarray, list[tuple[int, int]]]:
        """답변 토큰별 환각 확률과 문자 오프셋을 돌려준다."""
        enc = self.tok(answer, add_special_tokens=False, return_offsets_mapping=True)
        ans_ids = enc["input_ids"]
        offsets = enc["offset_mapping"]
        if not ans_ids:
            return np.zeros(0), []

        question = (question or "").strip()
        context = (context or "").strip()
        prompt = f"질문: {question}\n\n문서:\n{context}" if question else f"문서:\n{context}"
        prompt_ids = self.tok(prompt, add_special_tokens=False)["input_ids"]

        budget = self.max_length - len(ans_ids) - self.n_special
        if budget <= 0:
            # 답변만으로 한계를 넘는 경우 — 답변을 자를 수밖에 없다
            keep = self.max_length - self.n_special
            return self._forward([], ans_ids[:keep]), offsets[:keep]

        if len(prompt_ids) <= budget or not window:
            return self._forward(prompt_ids[:budget], ans_ids), offsets

        # 문서가 예산을 넘는다 → 절반씩 겹치는 창으로 훑는다
        stride = max(1, budget // 2)
        mat = []
        for s in range(0, len(prompt_ids), stride):
            chunk = prompt_ids[s:s + budget]
            if not chunk:
                break
            mat.append(self._forward(chunk, ans_ids))
            if s + budget >= len(prompt_ids):
                break
        return self._aggregate(np.stack(mat)), offsets

    def _aggregate(self, mat: np.ndarray) -> np.ndarray:
        """창 × 토큰 행렬을 토큰별 확률 하나로 합친다.

        `min` — "어느 창에서든 근거가 확인되면 지지". 의미상 가장 옳고 RAGTruth 에서
          검증된 방식이지만(macro F1 +0.03), **창이 많아질수록 확률이 0 쪽으로 눌린다.**
          RAGTruth 는 창이 2~3개였는데 실제 문서는 5~8개가 되어 임계값이 무너진다.
        `min2` — 두 번째로 작은 값. 창 하나가 우연히 낮게 준 것에 끌려가지 않아
          길이에 훨씬 덜 민감하다. **긴 실제 문서에는 이쪽을 권한다.**
        `mean` — 평균. 가장 안정적이지만 근거가 한 창에만 있을 때 놓친다.
        """
        if len(mat) == 1 or self.agg == "min":
            return mat.min(axis=0)
        if self.agg == "mean":
            return mat.mean(axis=0)
        if self.agg == "min2":
            return np.sort(mat, axis=0)[1]
        raise ValueError(f"모르는 집계 방식: {self.agg}")

    def spans(self, context: str, question: str, answer: str,
              threshold: float | None = None, window: bool = True,
              min_chars: int = 2) -> list[dict]:
        """환각으로 표시할 문자 구간 목록. 데모의 형광펜이 이걸 쓴다."""
        thr = self.threshold if threshold is None else threshold
        probs, offsets = self.token_probs(context, question, answer, window=window)
        if not len(probs):
            return []

        out: list[dict] = []
        cur_s = cur_e = None
        cur_p: list[float] = []
        for p, (s, e) in zip(probs, offsets):
            if s == e:
                continue
            if p >= thr:
                if cur_s is None:
                    cur_s, cur_e, cur_p = s, e, [float(p)]
                elif s - cur_e <= 1:            # 공백 하나 정도는 이어 붙인다
                    cur_e = e
                    cur_p.append(float(p))
                else:
                    out.append({"start": cur_s, "end": cur_e, "prob": max(cur_p)})
                    cur_s, cur_e, cur_p = s, e, [float(p)]
            elif cur_s is not None:
                out.append({"start": cur_s, "end": cur_e, "prob": max(cur_p)})
                cur_s = None
        if cur_s is not None:
            out.append({"start": cur_s, "end": cur_e, "prob": max(cur_p)})

        return [d for d in out if d["end"] - d["start"] >= min_chars]

    def highlighted(self, context: str, question: str, answer: str,
                    threshold: float | None = None, window: bool = True):
        """gradio.HighlightedText 가 바로 받는 [(조각, 라벨)] 형식."""
        sp = self.spans(context, question, answer, threshold, window)
        chunks, pos = [], 0
        for d in sp:
            if d["start"] > pos:
                chunks.append((answer[pos:d["start"]], None))
            chunks.append((answer[d["start"]:d["end"]], "환각 의심"))
            pos = d["end"]
        if pos < len(answer):
            chunks.append((answer[pos:], None))
        return chunks or [(answer, None)]
