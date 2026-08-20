"""Single-post analyze by URL: Apify instagram-scraper → video or slide JPEGs → Gemini → scores.

Flow:
  1. ``resolve_post_media`` (``apify~instagram-scraper``) → metadata + ``videoUrl`` or slide URLs
  2. Download MP4 (reel) or ordered slide images (carousel / image post)
  3. Gemini 3 Flash Preview via OpenRouter (``analyze_post_silas``)
  4. Parse scores → upsert ``scraped_reels`` (source=url_paste) + ``reel_analyses``

``skip_apify=True`` (auto-analyze backlog): uses DB row + caption; carousel/image rows optionally
re-fetch slides once via the same resolver for multimodal analysis.

See docs/ANALYZE-REEL-ENDPOINT-SPEC.md, docs/REEL-VIDEO-ANALYSIS-SPEC.md.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Any, Dict, List, Optional

import httpx

from core.config import Settings
from core.errors import MissingCredentialsError
from core.database import get_supabase_for_settings
from core.id_generator import generate_reel_id
from services.apify_posted_at import apify_instagram_item_posted_at_iso
from services.instagram_media import (
    ResolvedPostMedia,
    download_slide_images,
    media_kind_from_apify_item,
    resolve_post_media,
)
from services.openrouter import analyze_post_silas, analyze_reel_silas
from services.reel_analyze_parse import parse_silas_analysis_text
from services.reel_analyze_prompt import (
    PROMPT_VERSION,
    build_niche_context_block,
    build_reel_analysis_prompt,
)
from services.instagram_post_url import canonical_instagram_post_url
from services.apify_reel_fields import saves_and_shares_from_item, video_duration_seconds_from_item
from services.reel_thumbnail_url import reel_thumbnail_url_from_apify_item
from services.format_classifier import canonicalize_stored_format_key


class ReelAnalyzeTerminalError(Exception):
    """Expected failure for one URL (reel missing, private account, etc.)."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


# ── helpers ──────────────────────────────────────────────────────────────────


def _caption_text(item: dict) -> str:
    c = item.get("caption")
    if isinstance(c, dict):
        return str(c.get("text") or "")[:8000]
    if isinstance(c, str):
        return c[:8000]
    return ""


def _post_url_from_item(item: dict, fallback: str) -> str:
    u = item.get("url")
    if u:
        return str(u).strip()
    sc = item.get("shortCode")
    if sc:
        return f"https://www.instagram.com/reel/{sc}/"
    return fallback.strip()


def _owner_username(item: dict) -> str:
    return (
        str(item.get("ownerUsername") or item.get("owner_username") or "").strip() or "unknown"
    )


def _views_int(item: dict) -> int:
    return int(
        item.get("videoPlayCount")
        or item.get("videoViewCount")
        or item.get("playsCount")
        or 0
    )


def _hashtags(item: dict, caption: str) -> List[str]:
    raw = item.get("hashtags")
    if isinstance(raw, list) and raw:
        return [str(x).strip() for x in raw if x][:50]
    return re.findall(r"#[\w\u00C0-\u024F]+", caption)[:50]


def _download_video(url: str, dest: Path) -> None:
    with httpx.Client(timeout=120.0, follow_redirects=True) as client:
        r = client.get(url)
        r.raise_for_status()
        dest.write_bytes(r.content)


def _format_key_from_apify_item(item: dict) -> str:
    mk = media_kind_from_apify_item(item)
    if mk == "carousel":
        return "carousel"
    if mk == "image":
        return "image"
    return "reel"


def instagram_reel_url_is_valid(url: str) -> bool:
    t = url.lower()
    if "instagram.com" not in t:
        return False
    return bool(re.search(r"instagram\.com/(reel|reels|p|tv)(/|$)", t))


# ── persistence ──────────────────────────────────────────────────────────────


def _background_job_exists(supabase, job_id: Optional[str]) -> bool:
    """True when job_id is a real background_jobs row (FK target for scrape_job_id)."""
    if not job_id:
        return False
    try:
        r = (
            supabase.table("background_jobs")
            .select("id")
            .eq("id", job_id)
            .limit(1)
            .execute()
        )
        return bool(r.data)
    except Exception:
        return False


def _upsert_scraped_reel_for_url_paste(
    supabase,
    *,
    client_id: str,
    job_id: str,
    post_url: str,
    owner: str,
    item: dict,
    format_key: str = "reel",
) -> Optional[str]:
    """Insert/update a scraped_reels row with source='url_paste'. Returns the row id."""
    url_key = canonical_instagram_post_url(post_url)
    caption = _caption_text(item)
    views = _views_int(item)
    likes = int(item.get("likesCount") or item.get("likes") or 0)
    comments = int(item.get("commentsCount") or item.get("comments") or 0)
    saves, shares = saves_and_shares_from_item(item)
    thumb = reel_thumbnail_url_from_apify_item(item)
    hook = (caption.split("\n")[0][:500] if caption else "") or None
    video_duration = video_duration_seconds_from_item(item)

    existing_res = (
        supabase.table("scraped_reels")
        .select("id, competitor_id, scrape_job_id")
        .eq("client_id", client_id)
        .eq("post_url", url_key)
        .limit(1)
        .execute()
    )
    existing = existing_res.data[0] if existing_res.data else None
    reel_pk = str(existing["id"]) if existing else generate_reel_id()
    preserve_competitor = existing.get("competitor_id") if existing else None

    # scrape_job_id is a FK to background_jobs. Synchronous analyses (e.g. url_adapt
    # invoked from the router) pass a fabricated job id that has no background_jobs row,
    # which would violate the FK and abort the whole upsert (losing the analysis). Only
    # set it when it's a real job; otherwise preserve the existing value (or null).
    if _background_job_exists(supabase, job_id):
        effective_job_id = job_id
    else:
        effective_job_id = existing.get("scrape_job_id") if existing else None

    row = {
        "id": reel_pk,
        "client_id": client_id,
        "competitor_id": preserve_competitor,
        "scrape_job_id": effective_job_id,
        "post_url": url_key,
        "thumbnail_url": str(thumb) if thumb else None,
        "account_username": owner,
        "account_avg_views": None,
        "views": views,
        "likes": likes,
        "comments": comments,
        "saves": saves,
        "shares": shares,
        "outlier_ratio": None,
        "is_outlier": False,
        "hook_text": hook,
        "caption": caption or None,
        "hashtags": _hashtags(item, caption),
        "posted_at": apify_instagram_item_posted_at_iso(item),
        "format": (canonicalize_stored_format_key(format_key) or format_key or "reel"),
        "source": "url_paste",
        "video_duration": video_duration,
    }

    # Upsert by (client_id, post_url) — update metrics if the reel already exists.
    supabase.table("scraped_reels").upsert(row, on_conflict="client_id,post_url").execute()

    # Fetch the id (may be existing row if conflict).
    res = (
        supabase.table("scraped_reels")
        .select("id")
        .eq("client_id", client_id)
        .eq("post_url", url_key)
        .limit(1)
        .execute()
    )
    if res.data:
        return str(res.data[0]["id"])
    return reel_pk


def _upsert_reel_analysis(
    supabase,
    *,
    client_id: str,
    reel_id: Optional[str],
    job_id: str,
    post_url: str,
    owner: str,
    parsed: Dict[str, Any],
    full_text: str,
    model: str,
    video_analyzed: bool,
    source: str = "analyze_url",
    media_provenance: Optional[Dict[str, Any]] = None,
) -> Optional[str]:
    """Write structured analysis into reel_analyses. Returns the analysis row id."""
    url_key = canonical_instagram_post_url(post_url)
    now = datetime.now(timezone.utc).isoformat()
    scores = parsed.get("scores") or {}
    repl = parsed.get("replicable_elements")
    if not isinstance(repl, dict) or not repl:
        repl = None
    sugg = parsed.get("suggested_adaptations")
    if not isinstance(sugg, list) or not sugg:
        sugg = None

    full_analysis_json: Dict[str, Any] = {
        "full_text": full_text,
        "scores": scores,
        "video_analyzed": video_analyzed,
        "structured_summary": parsed.get("structured_summary"),
        "rating": parsed.get("rating"),
    }
    wt = parsed.get("weighted_total")
    if wt is not None:
        full_analysis_json["weighted_total"] = wt
    w_s = parsed.get("weighted_scores")
    if isinstance(w_s, dict) and w_s:
        full_analysis_json["weighted_scores"] = w_s
    r_s = parsed.get("raw_scores")
    if isinstance(r_s, dict) and r_s:
        full_analysis_json["raw_scores"] = r_s

    if isinstance(media_provenance, dict) and media_provenance:
        full_analysis_json["media_provenance"] = media_provenance

    # Verbatim on-screen text is only trustworthy when the model watched the video.
    if video_analyzed:
        vc = parsed.get("verbatim_capture")
        if isinstance(vc, dict) and (vc.get("on_screen_text") or vc.get("spoken_transcript")):
            full_analysis_json["verbatim_capture"] = vc
        else:
            try:
                prior_res = (
                    supabase.table("reel_analyses")
                    .select("full_analysis_json")
                    .eq("client_id", client_id)
                    .eq("post_url", url_key)
                    .limit(1)
                    .execute()
                )
                if prior_res.data:
                    prior_fa = prior_res.data[0].get("full_analysis_json")
                    if isinstance(prior_fa, dict):
                        prior_vc = prior_fa.get("verbatim_capture")
                        if isinstance(prior_vc, dict) and (
                            prior_vc.get("on_screen_text") or prior_vc.get("spoken_transcript")
                        ):
                            full_analysis_json["verbatim_capture"] = prior_vc
            except Exception:
                pass

    nf = parsed.get("normalized_format")
    if isinstance(nf, str) and nf.strip():
        nf_norm = str(nf).strip()
    else:
        nf_norm = None

    row: Dict[str, Any] = {
        "client_id": client_id,
        "reel_id": reel_id,
        "analysis_job_id": job_id,
        "source": source,
        "post_url": url_key,
        "instant_hook_score": scores.get("instant_hook"),
        "relatability_score": scores.get("high_relatability"),
        "cognitive_tension_score": scores.get("cognitive_tension"),
        "clear_value_score": scores.get("clear_value"),
        "comment_trigger_score": scores.get("comment_trigger"),
        "hook_type": parsed.get("hook_type"),
        "emotional_trigger": parsed.get("emotional_trigger"),
        "content_angle": parsed.get("content_angle"),
        "caption_structure": parsed.get("caption_structure"),
        "why_it_worked": parsed.get("why_it_worked"),
        "replicable_elements": repl,
        "suggested_adaptations": sugg,
        "full_analysis_json": full_analysis_json,
        "owner_username": owner,
        "model_used": model,
        "prompt_version": PROMPT_VERSION,
        "video_analyzed": video_analyzed,
        "analyzed_at": now,
    }
    if nf_norm:
        row["normalized_format"] = nf_norm

    supabase.table("reel_analyses").upsert(row, on_conflict="client_id,post_url").execute()

    res = (
        supabase.table("reel_analyses")
        .select("id, total_score, replicability_rating")
        .eq("client_id", client_id)
        .eq("post_url", url_key)
        .limit(1)
        .execute()
    )
    if res.data:
        return str(res.data[0]["id"])
    return None


def _complete_with_error(supabase, job_id: str, error_code: str) -> None:
    done = datetime.now(timezone.utc).isoformat()
    supabase.table("background_jobs").update(
        {
            "status": "completed",
            "completed_at": done,
            "result": {"status": "error", "error": error_code},
        }
    ).eq("id", job_id).execute()


BULK_ANALYZE_MAX_URLS = 20


def _niche_context_for_reel_analysis(supabase, client_id: str) -> Optional[str]:
    """Prefer client_dna.analysis_brief; else Source A via build_niche_context_block."""
    res = (
        supabase.table("clients")
        .select("name, instagram_handle, language, niche_config, icp, client_dna")
        .eq("id", client_id)
        .limit(1)
        .execute()
    )
    if not res.data:
        return None
    row = res.data[0]
    dna = row.get("client_dna")
    if isinstance(dna, dict):
        brief = str(dna.get("analysis_brief") or "").strip()
        if brief:
            return brief
    ig = str(row.get("instagram_handle") or "").replace("@", "").strip()
    return build_niche_context_block(
        client_name=str(row.get("name") or ""),
        instagram_handle=ig,
        language=str(row.get("language") or "de"),
        niches=row.get("niche_config") if isinstance(row.get("niche_config"), list) else [],
        icp=row.get("icp") if isinstance(row.get("icp"), dict) else {},
    )


def _fetch_scraped_reel_by_post_url(
    supabase, client_id: str, url_key: str
) -> Optional[Dict[str, Any]]:
    res = (
        supabase.table("scraped_reels")
        .select("*")
        .eq("client_id", client_id)
        .eq("post_url", url_key)
        .limit(1)
        .execute()
    )
    return res.data[0] if res.data else None


def _fetch_prior_silas_full_text(supabase, client_id: str, url_key: str) -> str:
    try:
        res = (
            supabase.table("reel_analyses")
            .select("full_analysis_json")
            .eq("client_id", client_id)
            .eq("post_url", url_key)
            .order("analyzed_at", desc=True)
            .limit(1)
            .execute()
        )
    except Exception:
        return ""
    if not res.data:
        return ""
    raw = res.data[0].get("full_analysis_json")
    if isinstance(raw, dict):
        return str(raw.get("full_text") or "").strip()
    return ""


def _caption_from_scraped_reel_row(row: Dict[str, Any]) -> str:
    c = row.get("caption")
    if isinstance(c, dict):
        return str(c.get("text") or "")[:8000]
    if isinstance(c, str):
        return c[:8000]
    return ""


def _execute_reel_analyze_url_core(
    settings: Settings,
    supabase,
    *,
    client_id: str,
    analysis_job_id: str,
    reel_url: str,
    analysis_source: str = "analyze_url",
    niche_context: Optional[str] = None,
    skip_apify: bool = False,
) -> Dict[str, Any]:
    """Scrape one URL, run Gemini, persist. Raises ReelAnalyzeTerminalError for expected misses."""
    url_key = canonical_instagram_post_url(reel_url)

    if skip_apify:
        sr = _fetch_scraped_reel_by_post_url(supabase, client_id, url_key)
        if not sr:
            raise ReelAnalyzeTerminalError("reel_not_in_db")
        prior = _fetch_prior_silas_full_text(supabase, client_id, url_key)
        owner = str(sr.get("account_username") or "").strip() or "unknown"
        views = int(sr.get("views") or 0)
        likes = int(sr.get("likes") or 0)
        comments = int(sr.get("comments") or 0)
        caption = _caption_from_scraped_reel_row(sr)
        post_url = str(sr.get("post_url") or reel_url)
        fmt_raw = str(sr.get("format") or "").strip().lower()
        is_carousel_row = (canonicalize_stored_format_key(sr.get("format")) or "") == "carousel"
        is_image_row = fmt_raw == "image"
        model = settings.openrouter_reel_analyze_model

        media_prov: Dict[str, Any] = {
            "media_type": "none",
            "slides_analyzed": 0,
            "video_analyzed": False,
        }
        full_text = ""
        resolved_skip: Optional[ResolvedPostMedia] = None

        if (is_carousel_row or is_image_row) and settings.apify_api_token:
            resolved_skip = resolve_post_media(settings.apify_api_token, post_url or url_key)
            if resolved_skip and resolved_skip.slide_urls:
                slide_bytes = download_slide_images(resolved_skip.slide_urls)
                if slide_bytes:
                    is_carousel_prompt = media_kind_from_apify_item(resolved_skip.item) == "carousel"
                    ig_owner = _owner_username(resolved_skip.item) or owner
                    ig_views = _views_int(resolved_skip.item)
                    ig_likes = int(
                        resolved_skip.item.get("likesCount")
                        or resolved_skip.item.get("likes")
                        or likes
                    )
                    ig_comments = int(
                        resolved_skip.item.get("commentsCount")
                        or resolved_skip.item.get("comments")
                        or comments
                    )
                    ig_caption = _caption_text(resolved_skip.item) or caption
                    prompt = build_reel_analysis_prompt(
                        owner=ig_owner,
                        views="" if is_carousel_prompt else f"{ig_views:,}",
                        likes=f"{ig_likes:,}",
                        comments=f"{ig_comments:,}",
                        caption=ig_caption,
                        niche_context=niche_context,
                        text_reanalyze=False,
                        prior_full_text=None,
                        is_carousel=is_carousel_prompt,
                    )
                    full_text, media_prov = analyze_post_silas(
                        settings.openrouter_api_key,
                        model,
                        prompt,
                        image_bytes_list=slide_bytes,
                    )
                    owner, views, likes, comments, caption = (
                        ig_owner,
                        ig_views,
                        ig_likes,
                        ig_comments,
                        ig_caption,
                    )
                else:
                    prompt = build_reel_analysis_prompt(
                        owner=owner,
                        views="" if is_carousel_row else f"{views:,}",
                        likes=f"{likes:,}",
                        comments=f"{comments:,}",
                        caption=caption,
                        niche_context=niche_context,
                        text_reanalyze=True,
                        prior_full_text=prior if prior else None,
                        is_carousel=is_carousel_row,
                    )
                    full_text, video_analyzed_fb = analyze_reel_silas(
                        settings.openrouter_api_key,
                        model,
                        prompt,
                        video_path=None,
                        text_reanalyze=True,
                    )
                    media_prov = {
                        "media_type": "none",
                        "slides_analyzed": 0,
                        "video_analyzed": bool(video_analyzed_fb),
                    }
            else:
                prompt = build_reel_analysis_prompt(
                    owner=owner,
                    views="" if is_carousel_row else f"{views:,}",
                    likes=f"{likes:,}",
                    comments=f"{comments:,}",
                    caption=caption,
                    niche_context=niche_context,
                    text_reanalyze=True,
                    prior_full_text=prior if prior else None,
                    is_carousel=is_carousel_row,
                )
                full_text, video_analyzed_fb = analyze_reel_silas(
                    settings.openrouter_api_key,
                    model,
                    prompt,
                    video_path=None,
                    text_reanalyze=True,
                )
                media_prov = {
                    "media_type": "none",
                    "slides_analyzed": 0,
                    "video_analyzed": bool(video_analyzed_fb),
                }
        else:
            prompt = build_reel_analysis_prompt(
                owner=owner,
                views="" if is_carousel_row else f"{views:,}",
                likes=f"{likes:,}",
                comments=f"{comments:,}",
                caption=caption,
                niche_context=niche_context,
                text_reanalyze=True,
                prior_full_text=prior if prior else None,
                is_carousel=is_carousel_row,
            )
            full_text, video_analyzed_fb = analyze_reel_silas(
                settings.openrouter_api_key,
                model,
                prompt,
                video_path=None,
                text_reanalyze=True,
            )
            media_prov = {
                "media_type": "none",
                "slides_analyzed": 0,
                "video_analyzed": bool(video_analyzed_fb),
            }

        parsed = parse_silas_analysis_text(full_text)
        video_analyzed_col = bool(media_prov.get("video_analyzed"))
        reel_row_id = str(sr["id"])
        persist_source = f"{analysis_source}_llm_only"

        if (
            resolved_skip
            and int(media_prov.get("slides_analyzed") or 0) > 0
            and isinstance(resolved_skip.item, dict)
        ):
            try:
                new_id = _upsert_scraped_reel_for_url_paste(
                    supabase,
                    client_id=client_id,
                    job_id=analysis_job_id,
                    post_url=_post_url_from_item(resolved_skip.item, post_url),
                    owner=_owner_username(resolved_skip.item) or owner,
                    item=resolved_skip.item,
                    format_key=_format_key_from_apify_item(resolved_skip.item),
                )
                if new_id:
                    reel_row_id = new_id
            except Exception:
                pass

        if _background_job_exists(supabase, analysis_job_id):
            try:
                supabase.table("scraped_reels").update(
                    {"scrape_job_id": analysis_job_id}
                ).eq("id", reel_row_id).execute()
            except Exception:
                pass
        analysis_id: Optional[str] = None
        persist_error: Optional[str] = None
        try:
            analysis_id = _upsert_reel_analysis(
                supabase,
                client_id=client_id,
                reel_id=reel_row_id,
                job_id=analysis_job_id,
                post_url=post_url,
                owner=owner,
                parsed=parsed,
                full_text=full_text,
                model=model,
                video_analyzed=video_analyzed_col,
                source=persist_source,
                media_provenance=media_prov,
            )
        except Exception as e:
            persist_error = str(e)[:800]
        scores = parsed.get("scores") or {}
        analysis_payload: Dict[str, Any] = {
            "total_score": parsed.get("total_score"),
            "rating": parsed.get("rating"),
            "scores": {
                "instant_hook": scores.get("instant_hook"),
                "high_relatability": scores.get("high_relatability"),
                "cognitive_tension": scores.get("cognitive_tension"),
                "clear_value": scores.get("clear_value"),
                "comment_trigger": scores.get("comment_trigger"),
            },
            "full_text": full_text,
            "prompt_version": PROMPT_VERSION,
            "model": model,
            "analyzed_at": datetime.now(timezone.utc).isoformat(),
            "video_analyzed": video_analyzed_col,
            "media_provenance": media_prov,
            "skip_apify": True,
        }
        if parsed.get("weighted_total") is not None:
            analysis_payload["weighted_total"] = parsed.get("weighted_total")
        rs = parsed.get("raw_scores")
        if isinstance(rs, dict) and rs:
            analysis_payload["raw_scores"] = rs
        duration_int = video_duration_seconds_from_item(dict(sr)) or 0
        ts_out = sr.get("posted_at")
        if ts_out is not None:
            ts_out = str(ts_out)
        result_body: Dict[str, Any] = {
            "status": "completed",
            "skip_apify": True,
            "reel": {
                "url": url_key,
                "owner": owner,
                "views": views,
                "likes": likes,
                "comments": comments,
                "duration": duration_int,
                "timestamp": ts_out,
            },
            "analysis": analysis_payload,
        }
        if analysis_id:
            result_body["analysis_id"] = analysis_id
        result_body["reel_id"] = reel_row_id
        if persist_error:
            result_body["persist_error"] = persist_error
        return result_body

    tmp_path: Optional[Path] = None
    try:
        if not settings.apify_api_token:
            raise MissingCredentialsError("APIFY_API_TOKEN required")
        resolved = resolve_post_media(settings.apify_api_token, reel_url)
        if not resolved:
            raise ReelAnalyzeTerminalError("reel_not_found")

        item = resolved.item
        owner = _owner_username(item)
        views = _views_int(item)
        likes = int(item.get("likesCount") or item.get("likes") or 0)
        comments = int(item.get("commentsCount") or item.get("comments") or 0)
        caption = _caption_text(item)
        post_url = _post_url_from_item(item, reel_url)
        url_key = canonical_instagram_post_url(post_url)
        model = settings.openrouter_reel_analyze_model

        mk = media_kind_from_apify_item(item)
        is_carousel_prompt = mk == "carousel"
        media_prov: Dict[str, Any] = {
            "media_type": "none",
            "slides_analyzed": 0,
            "video_analyzed": False,
        }
        full_text = ""

        if resolved.kind == "video" and resolved.video_url:
            tmp_f = NamedTemporaryFile(suffix=".mp4", delete=False)
            tmp_path = Path(tmp_f.name)
            tmp_f.close()
            try:
                _download_video(str(resolved.video_url), tmp_path)
            except Exception:
                if tmp_path.is_file():
                    tmp_path.unlink(missing_ok=True)
                tmp_path = None
            if tmp_path and tmp_path.is_file():
                prompt = build_reel_analysis_prompt(
                    owner=owner,
                    views=f"{views:,}",
                    likes=f"{likes:,}",
                    comments=f"{comments:,}",
                    caption=caption,
                    niche_context=niche_context,
                    text_reanalyze=False,
                    prior_full_text=None,
                    is_carousel=False,
                )
                full_text, media_prov = analyze_post_silas(
                    settings.openrouter_api_key,
                    model,
                    prompt,
                    video_path=tmp_path,
                )
            else:
                prompt = build_reel_analysis_prompt(
                    owner=owner,
                    views=f"{views:,}",
                    likes=f"{likes:,}",
                    comments=f"{comments:,}",
                    caption=caption,
                    niche_context=niche_context,
                    text_reanalyze=False,
                    prior_full_text=None,
                    is_carousel=False,
                )
                full_text, media_prov = analyze_post_silas(
                    settings.openrouter_api_key,
                    model,
                    prompt,
                    video_path=None,
                    image_bytes_list=None,
                    text_reanalyze=False,
                )
        elif resolved.slide_urls:
            slide_bytes = download_slide_images(resolved.slide_urls)
            prompt = build_reel_analysis_prompt(
                owner=owner,
                views="" if is_carousel_prompt else f"{views:,}",
                likes=f"{likes:,}",
                comments=f"{comments:,}",
                caption=caption,
                niche_context=niche_context,
                text_reanalyze=False,
                prior_full_text=None,
                is_carousel=is_carousel_prompt,
            )
            full_text, media_prov = analyze_post_silas(
                settings.openrouter_api_key,
                model,
                prompt,
                image_bytes_list=slide_bytes or None,
            )
        else:
            if not caption.strip():
                raise ReelAnalyzeTerminalError("private_account")
            prompt = build_reel_analysis_prompt(
                owner=owner,
                views="" if is_carousel_prompt else f"{views:,}",
                likes=f"{likes:,}",
                comments=f"{comments:,}",
                caption=caption,
                niche_context=niche_context,
                text_reanalyze=False,
                prior_full_text=None,
                is_carousel=is_carousel_prompt,
            )
            full_text, media_prov = analyze_post_silas(
                settings.openrouter_api_key,
                model,
                prompt,
                video_path=None,
                image_bytes_list=None,
                text_reanalyze=False,
            )

        parsed = parse_silas_analysis_text(full_text)

        duration_int = video_duration_seconds_from_item(item) or 0
        ts = apify_instagram_item_posted_at_iso(item)
        video_analyzed_col = bool(media_prov.get("video_analyzed"))

        reel_row_id: Optional[str] = None
        analysis_id: Optional[str] = None
        persist_error: Optional[str] = None
        try:
            reel_row_id = _upsert_scraped_reel_for_url_paste(
                supabase,
                client_id=client_id,
                job_id=analysis_job_id,
                post_url=post_url,
                owner=owner,
                item=item,
                format_key=_format_key_from_apify_item(item),
            )
            analysis_id = _upsert_reel_analysis(
                supabase,
                client_id=client_id,
                reel_id=reel_row_id,
                job_id=analysis_job_id,
                post_url=post_url,
                owner=owner,
                parsed=parsed,
                full_text=full_text,
                model=model,
                video_analyzed=video_analyzed_col,
                source=analysis_source,
                media_provenance=media_prov,
            )
        except Exception as e:
            persist_error = str(e)[:800]

        scores = parsed.get("scores") or {}
        analysis_payload: Dict[str, Any] = {
            "total_score": parsed.get("total_score"),
            "rating": parsed.get("rating"),
            "scores": {
                "instant_hook": scores.get("instant_hook"),
                "high_relatability": scores.get("high_relatability"),
                "cognitive_tension": scores.get("cognitive_tension"),
                "clear_value": scores.get("clear_value"),
                "comment_trigger": scores.get("comment_trigger"),
            },
            "full_text": full_text,
            "prompt_version": PROMPT_VERSION,
            "model": model,
            "analyzed_at": datetime.now(timezone.utc).isoformat(),
            "video_analyzed": video_analyzed_col,
            "media_provenance": media_prov,
        }
        if parsed.get("weighted_total") is not None:
            analysis_payload["weighted_total"] = parsed.get("weighted_total")
        rs = parsed.get("raw_scores")
        if isinstance(rs, dict) and rs:
            analysis_payload["raw_scores"] = rs

        result_body: Dict[str, Any] = {
            "status": "completed",
            "skip_apify": False,
            "reel": {
                "url": url_key,
                "owner": owner,
                "views": views,
                "likes": likes,
                "comments": comments,
                "duration": duration_int,
                "timestamp": ts,
            },
            "analysis": analysis_payload,
        }
        if analysis_id:
            result_body["analysis_id"] = analysis_id
        if reel_row_id:
            result_body["reel_id"] = reel_row_id
        if persist_error:
            result_body["persist_error"] = persist_error
        return result_body
    finally:
        if tmp_path and tmp_path.is_file():
            try:
                tmp_path.unlink()
            except OSError:
                pass


def run_reel_analyze_url(settings: Settings, job: Dict[str, Any]) -> None:
    if not settings.openrouter_api_key:
        raise MissingCredentialsError("OPENROUTER_API_KEY required")

    supabase = get_supabase_for_settings(settings)
    job_id = job["id"]
    client_id = job.get("client_id")
    if not client_id:
        raise RuntimeError("reel_analyze_url job missing client_id")

    payload = job.get("payload") or {}
    skip_apify = bool(payload.get("skip_apify"))
    raw_url = str(payload.get("url") or "").strip()
    reel_url = raw_url.strip()
    if not reel_url or not instagram_reel_url_is_valid(reel_url):
        raise ValueError("Invalid Instagram reel or post URL")

    if not skip_apify and not settings.apify_api_token:
        raise RuntimeError("APIFY_API_TOKEN required unless skip_apify is true")

    now = datetime.now(timezone.utc).isoformat()
    supabase.table("background_jobs").update({"status": "running", "started_at": now}).eq(
        "id", job_id
    ).execute()

    niche_ctx = _niche_context_for_reel_analysis(supabase, client_id)
    try:
        result_body = _execute_reel_analyze_url_core(
            settings,
            supabase,
            client_id=client_id,
            analysis_job_id=job_id,
            reel_url=reel_url,
            analysis_source="analyze_url",
            niche_context=niche_ctx,
            skip_apify=skip_apify,
        )
        done = datetime.now(timezone.utc).isoformat()
        supabase.table("background_jobs").update(
            {"status": "completed", "completed_at": done, "result": result_body}
        ).eq("id", job_id).execute()
    except ReelAnalyzeTerminalError as e:
        _complete_with_error(supabase, job_id, e.code)


def run_reel_analyze_bulk(settings: Settings, job: Dict[str, Any]) -> None:
    if not settings.openrouter_api_key:
        raise MissingCredentialsError("OPENROUTER_API_KEY required")

    supabase = get_supabase_for_settings(settings)
    job_id = job["id"]
    client_id = job.get("client_id")
    if not client_id:
        raise RuntimeError("reel_analyze_bulk job missing client_id")

    payload = job.get("payload") or {}
    skip_apify = bool(payload.get("skip_apify"))
    if not skip_apify and not settings.apify_api_token:
        raise MissingCredentialsError("APIFY_API_TOKEN required unless skip_apify is true")

    raw_urls = payload.get("urls") or []
    if not isinstance(raw_urls, list):
        raise ValueError("reel_analyze_bulk: urls must be a list")

    urls: List[str] = []
    seen: set[str] = set()
    for u in raw_urls:
        s = str(u).strip()
        if not s or not instagram_reel_url_is_valid(s):
            continue
        key = canonical_instagram_post_url(s)
        if key in seen:
            continue
        seen.add(key)
        urls.append(s)
        if len(urls) >= BULK_ANALYZE_MAX_URLS:
            break

    if not urls:
        raise ValueError("reel_analyze_bulk: no valid Instagram URLs")

    now = datetime.now(timezone.utc).isoformat()
    supabase.table("background_jobs").update({"status": "running", "started_at": now}).eq(
        "id", job_id
    ).execute()

    niche_ctx = _niche_context_for_reel_analysis(supabase, client_id)

    succeeded = 0
    items_out: List[Dict[str, Any]] = []
    failures: List[Dict[str, str]] = []

    for i, reel_url in enumerate(urls):
        prog = {
            "status": "running",
            "progress": {"done": i, "total": len(urls), "current_url": reel_url},
        }
        supabase.table("background_jobs").update({"result": prog}).eq("id", job_id).execute()

        try:
            one = _execute_reel_analyze_url_core(
                settings,
                supabase,
                client_id=client_id,
                analysis_job_id=job_id,
                reel_url=reel_url,
                analysis_source="analyze_bulk",
                niche_context=niche_ctx,
                skip_apify=skip_apify,
            )
            succeeded += 1
            items_out.append(
                {
                    "url": one.get("reel", {}).get("url") or canonical_instagram_post_url(reel_url),
                    "ok": True,
                    "reel_id": one.get("reel_id"),
                    "analysis_id": one.get("analysis_id"),
                }
            )
        except ReelAnalyzeTerminalError as e:
            failures.append({"url": canonical_instagram_post_url(reel_url), "error": e.code})
            items_out.append(
                {
                    "url": canonical_instagram_post_url(reel_url),
                    "ok": False,
                    "error": e.code,
                }
            )
        except Exception as e:
            err = str(e)[:500]
            failures.append({"url": canonical_instagram_post_url(reel_url), "error": err})
            items_out.append(
                {
                    "url": canonical_instagram_post_url(reel_url),
                    "ok": False,
                    "error": err,
                }
            )

    done = datetime.now(timezone.utc).isoformat()
    summary: Dict[str, Any] = {
        "status": "completed",
        "bulk": True,
        "total": len(urls),
        "succeeded": succeeded,
        "failed": len(urls) - succeeded,
        "items": items_out,
    }
    if failures:
        summary["failures"] = failures

    supabase.table("background_jobs").update(
        {"status": "completed", "completed_at": done, "result": summary}
    ).eq("id", job_id).execute()
