"""Local HTTP API. Binds to 127.0.0.1 and loads the model only once."""
from __future__ import annotations

import argparse
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")

from detector_runtime import BgeM3HallucinationDetector


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-dir", default="model")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=18768)
    parser.add_argument("--device", choices=["cpu", "cuda"], default="cuda")
    parser.add_argument("--threshold", type=float, default=0.5)
    parser.add_argument("--max-length", type=int, default=512)
    parser.add_argument("--aggregation", choices=["min", "min2", "mean"], default="min")
    args = parser.parse_args()
    model_dir = Path(args.model_dir)
    if not model_dir.is_absolute():
        model_dir = Path(__file__).resolve().parent / model_dir
    detector = BgeM3HallucinationDetector(
        model_dir, device=args.device, threshold=args.threshold,
        max_length=args.max_length, aggregation=args.aggregation
    )

    class Handler(BaseHTTPRequestHandler):
        def _headers(self, status: int = 200) -> None:
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.end_headers()

        def _json(self, data: dict, status: int = 200) -> None:
            self._headers(status)
            self.wfile.write(json.dumps(data, ensure_ascii=False).encode("utf-8"))

        def do_OPTIONS(self) -> None:
            self._headers(204)

        def do_GET(self) -> None:
            if self.path == "/health":
                self._json({"status": "ok", "device": args.device,
                            "model": "ASTRA BGE-M3 hallucination token classifier",
                            "weights_sha256": detector.weight_sha256})
            else:
                self._json({"error": "not_found"}, 404)

        def do_POST(self) -> None:
            if self.path != "/detect":
                self._json({"error": "not_found"}, 404)
                return
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if length <= 0 or length > 10 * 1024 * 1024:
                    raise ValueError("invalid request size")
                payload = json.loads(self.rfile.read(length).decode("utf-8"))
                result = detector.detect(
                    context=payload.get("context", ""),
                    question=payload.get("question", ""),
                    answer=payload.get("answer", ""),
                )
                self._json(result)
            except (ValueError, TypeError, json.JSONDecodeError) as exc:
                self._json({"status": "failed", "error": type(exc).__name__,
                            "message": str(exc)}, 400)
            except Exception as exc:
                self._json({"status": "failed", "error": type(exc).__name__}, 500)

        def log_message(self, fmt: str, *values) -> None:
            print("[%s] %s" % (self.log_date_time_string(), fmt % values), flush=True)

    print(f"BGE-M3 detector ready: http://{args.host}:{args.port}", flush=True)
    print("GET /health · POST /detect", flush=True)
    ThreadingHTTPServer((args.host, args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
