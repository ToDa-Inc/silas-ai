"""OpenRouter speech-to-text via /api/v1/audio/transcriptions."""

from __future__ import annotations

import base64
import logging
import os
import re
import subprocess
import tempfile
from pathlib import Path
from typing import Optional

import httpx

from services.openrouter import _openrouter_request_headers, _sleep_seconds_for_429
from services.openrouter_limiter import wait_for_openrouter_request_slot

logger = logging.getLogger(__name__)

_OPENROUTER_STT_URL = "https://openrouter.ai/api/v1/audio/transcriptions"
_CHUNK_SECONDS = 85
_MAX_AUDIO_BYTES = 24 * 1024 * 1024


def probe_audio_duration_seconds(audio_bytes: bytes, audio_format: str) -> float | None:
    """Best-effort duration via ffprobe; None if unavailable."""
    fmt = (audio_format or "webm").strip().lower().lstrip(".")
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / f"probe.{fmt}"
        src.write_bytes(audio_bytes)
        try:
            r = subprocess.run(
                [
                    "ffprobe",
                    "-v",
                    "error",
                    "-show_entries",
                    "format=duration",
                    "-of",
                    "default=noprint_wrappers=1:nokey=1",
                    str(src),
                ],
                check=True,
                capture_output=True,
                text=True,
                timeout=30,
            )
            val = float((r.stdout or "").strip())
            return val if val > 0 else None
        except (subprocess.CalledProcessError, FileNotFoundError, ValueError, subprocess.TimeoutExpired):
            try:
                r = subprocess.run(
                    ["ffmpeg", "-i", str(src), "-f", "null", "-"],
                    capture_output=True,
                    text=True,
                    timeout=60,
                )
                m = None
                for line in (r.stderr or "").splitlines():
                    hit = re.search(r"time=(\d+):(\d+):(\d+(?:\.\d+)?)", line)
                    if hit:
                        m = hit
                if m:
                    h, mi, s = m.groups()
                    return int(h) * 3600 + int(mi) * 60 + float(s)
            except (FileNotFoundError, subprocess.TimeoutExpired, ValueError):
                return None
    return None


def _transcribe_chunk(
    *,
    openrouter_key: str,
    model: str,
    audio_bytes: bytes,
    audio_format: str,
    language: Optional[str],
    settings,
) -> str:
    payload: dict = {
        "model": model,
        "input_audio": {
            "data": base64.b64encode(audio_bytes).decode("ascii"),
            "format": audio_format,
        },
        "temperature": 0,
    }
    if language:
        payload["language"] = language

    headers = _openrouter_request_headers(openrouter_key)
    max_attempts = max(1, int(settings.openrouter_429_max_attempts))
    max_sleep = float(settings.openrouter_429_max_sleep_s)

    with httpx.Client(timeout=180.0) as client:
        last: httpx.Response | None = None
        for attempt in range(max_attempts):
            wait_for_openrouter_request_slot(settings)
            try:
                r = client.post(_OPENROUTER_STT_URL, headers=headers, json=payload)
            except (httpx.RemoteProtocolError, httpx.ReadTimeout, httpx.ConnectError, httpx.WriteError) as e:
                delay = min(max_sleep, 2.0 * (attempt + 1))
                logger.warning(
                    "OpenRouter STT transport error attempt=%s/%s sleep=%.1fs err=%s",
                    attempt + 1,
                    max_attempts,
                    delay,
                    e,
                )
                if attempt < max_attempts - 1:
                    import time

                    time.sleep(delay)
                    continue
                raise RuntimeError(f"OpenRouter STT connection failed: {e}") from e
            last = r
            if r.status_code == 429:
                delay = _sleep_seconds_for_429(r, attempt, max_sleep)
                logger.warning("OpenRouter STT 429 attempt=%s sleep=%.1fs", attempt + 1, delay)
                if attempt < max_attempts - 1:
                    import time

                    time.sleep(delay)
                    continue
            r.raise_for_status()
            data = r.json()
            if data.get("error"):
                raise RuntimeError(data["error"].get("message", str(data["error"])))
            text = str(data.get("text") or "").strip()
            if not text:
                raise RuntimeError("OpenRouter STT returned empty text")
            return text
    assert last is not None
    last.raise_for_status()
    return ""


def _ffmpeg_chunks(audio_bytes: bytes, audio_format: str) -> list[bytes]:
    """Split audio into ~85s segments via ffmpeg; returns one chunk if ffmpeg unavailable."""
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / f"input.{audio_format}"
        src.write_bytes(audio_bytes)
        # Avoid `%` near Path `/` — operator precedence can turn this into (Path / str) % str.
        out_pattern = os.path.join(tmp, "chunk_%03d." + audio_format)
        cmd = [
            "ffmpeg",
            "-y",
            "-i",
            str(src),
            "-f",
            "segment",
            "-segment_time",
            str(_CHUNK_SECONDS),
            "-c",
            "copy",
            out_pattern,
        ]
        try:
            subprocess.run(cmd, check=True, capture_output=True, timeout=120)
        except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired) as e:
            logger.warning("ffmpeg chunking unavailable (%s); transcribing whole file", e)
            return [audio_bytes]

        chunks = sorted(Path(tmp).glob(f"chunk_*.{audio_format}"))
        if not chunks:
            return [audio_bytes]
        return [p.read_bytes() for p in chunks if p.stat().st_size > 0] or [audio_bytes]


def transcribe_audio(
    *,
    openrouter_key: str,
    model: str,
    audio_bytes: bytes,
    audio_format: str,
    language: Optional[str] = None,
) -> str:
    """Transcribe audio bytes; chunks long recordings to avoid upstream timeouts."""
    from core.config import get_settings

    if not audio_bytes:
        raise ValueError("Empty audio payload")
    if len(audio_bytes) > _MAX_AUDIO_BYTES:
        raise ValueError("Audio file too large (max 24 MB)")

    fmt = (audio_format or "webm").strip().lower().lstrip(".")
    settings = get_settings()
    chunks = _ffmpeg_chunks(audio_bytes, fmt)
    parts: list[str] = []
    for i, chunk in enumerate(chunks):
        text = _transcribe_chunk(
            openrouter_key=openrouter_key,
            model=model,
            audio_bytes=chunk,
            audio_format=fmt,
            language=language,
            settings=settings,
        )
        if text:
            parts.append(text)
        logger.info("STT chunk %s/%s: %s chars", i + 1, len(chunks), len(text))
    combined = " ".join(parts).strip()
    if not combined:
        raise RuntimeError("Transcription produced no text")
    return combined
