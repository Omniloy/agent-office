#!/usr/bin/env python3
"""office-stt: the transcription service behind the office's Speak button. One small HTTP server, three engines.

  office-stt.py --engine mlx     [--model mlx-community/Qwen3-ASR-1.7B-4bit]   Apple Silicon (mlx-audio)
  office-stt.py --engine qwen    [--model Qwen/Qwen3-ASR-1.7B]                 Linux / Windows with an NVIDIA GPU (qwen-asr)
  office-stt.py --engine whisper [--model small]                               any machine, CPU only (faster-whisper)
  options: --port 4330  --host 127.0.0.1  --language Spanish (default: detect)

  GET  /health                      {"ok": true, "engine": ..., "model": ..., "ready": true}
  POST /transcribe?context=...&language=...     body: WAV, 16 kHz, mono, 16-bit
                                    {"text": "...", "language": "...", "seconds": 1.2, "audio": 4.0}
`context` is free text with the words the engine should expect (names, products, ticket prefixes). It listens on
this machine only; the office server is the one that talks to it. Only the standard library plus the engine."""
import argparse, io, json, sys, time, wave, threading, queue
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

ap = argparse.ArgumentParser()
ap.add_argument("--engine", default="mlx", choices=["mlx", "qwen", "whisper"])
ap.add_argument("--model", default="")
ap.add_argument("--port", type=int, default=4330)
ap.add_argument("--host", default="127.0.0.1")
ap.add_argument("--language", default="")
A = ap.parse_args()
DEFAULT = {"mlx": "mlx-community/Qwen3-ASR-1.7B-4bit", "qwen": "Qwen/Qwen3-ASR-1.7B", "whisper": "small"}
MODEL = A.model or DEFAULT[A.engine]
import numpy as np

def read_wav(raw):
    with wave.open(io.BytesIO(raw)) as w:
        if w.getsampwidth() != 2: raise ValueError("WAV must be 16-bit")
        x = np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").astype(np.float32) / 32768.0
        if w.getnchannels() > 1: x = x.reshape(-1, w.getnchannels()).mean(axis=1)
        sr = w.getframerate()
    if sr != 16000:  # the office sends 16 kHz; anything else is brought there
        n = int(len(x) * 16000 / sr); x = np.interp(np.linspace(0, len(x) - 1, n), np.arange(len(x)), x).astype(np.float32)
    return x

def prompt(context):  # how the expected words are handed to the model
    return f"Vocabulary that may appear: {context}" if context else None

if A.engine == "mlx":
    from mlx_audio.stt.utils import load
    model = load(MODEL)
    def transcribe(x, context, language):
        out = model.generate(x, language=language or None, system_prompt=prompt(context))
        lang = getattr(out, "language", None); lang = lang[0] if isinstance(lang, list) and lang else lang
        return out.text.strip(), lang or ""
elif A.engine == "qwen":
    import torch
    from qwen_asr import Qwen3ASRModel
    model = Qwen3ASRModel.from_pretrained(MODEL, dtype=torch.bfloat16 if torch.cuda.is_available() else torch.float32, device_map="cuda:0" if torch.cuda.is_available() else "cpu", max_new_tokens=512)
    def transcribe(x, context, language):
        r = model.transcribe(audio=(x, 16000), language=language or None, context=context or "")[0]
        return r.text.strip(), getattr(r, "language", "") or ""
else:
    from faster_whisper import WhisperModel
    model = WhisperModel(MODEL, device="cpu", compute_type="int8")
    CODES = {"spanish": "es", "english": "en", "french": "fr", "german": "de", "portuguese": "pt", "italian": "it", "catalan": "ca"}
    def transcribe(x, context, language):
        lang = CODES.get((language or "").lower(), (language or None))
        segs, info = model.transcribe(x, language=lang, hotwords=context or None, vad_filter=True)
        return " ".join(s.text.strip() for s in segs).strip(), info.language

JOBS = queue.Queue()  # the model lives in the main thread (MLX needs that): requests wait their turn here
class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def send(self, code, body):
        b = json.dumps(body, ensure_ascii=False).encode(); self.send_response(code); self.send_header("content-type", "application/json"); self.send_header("content-length", str(len(b))); self.end_headers(); self.wfile.write(b)
    def do_GET(self):
        if urlparse(self.path).path == "/health": return self.send(200, {"ok": True, "engine": A.engine, "model": MODEL, "ready": True})
        self.send(404, {"error": "not found"})
    def do_POST(self):
        u = urlparse(self.path); q = parse_qs(u.query)
        if u.path != "/transcribe": return self.send(404, {"error": "not found"})
        n = int(self.headers.get("content-length") or 0)
        if n <= 44 or n > 12_000_000: return self.send(400, {"error": "no audio, or more than about six minutes"})
        try: x = read_wav(self.rfile.read(n))
        except Exception as e: return self.send(400, {"error": f"not a 16-bit WAV: {e}"})
        if len(x) < 4000 or float(np.abs(x).max()) < 0.004: return self.send(200, {"text": "", "language": "", "seconds": 0, "audio": round(len(x) / 16000, 2)})
        t = time.time()
        job = {"x": x, "context": (q.get("context") or [""])[0][:2000], "language": (q.get("language") or [A.language])[0], "done": threading.Event()}
        JOBS.put(job)
        if not job["done"].wait(600): return self.send(504, {"error": "the transcription took too long"})
        if job.get("error"): return self.send(500, {"error": job["error"]})
        text, lang = job["out"]
        self.send(200, {"text": text, "language": lang, "seconds": round(time.time() - t, 2), "audio": round(len(x) / 16000, 2)})

print(f"office-stt: {A.engine} {MODEL} on http://{A.host}:{A.port}", flush=True)
threading.Thread(target=ThreadingHTTPServer((A.host, A.port), H).serve_forever, daemon=True).start()
while True:
    job = JOBS.get()
    try: job["out"] = transcribe(job["x"], job["context"], job["language"])
    except Exception as e: job["error"] = f"{type(e).__name__}: {e}"
    job["done"].set()
