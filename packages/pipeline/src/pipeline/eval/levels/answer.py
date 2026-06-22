"""Level 3: End-to-end answer quality evaluation."""

import json
import os
import signal
import subprocess
import logging
import threading
import time

from pipeline.config import ANTHROPIC_API_KEY, VOYAGE_API_KEY, AGENT_DIR
from pipeline.graph.connection import get_session
from pipeline.eval.judge import judge_answer
from pipeline.eval.citation import score_citation_support
from pipeline.eval.evidence import build_judge_evidence

logger = logging.getLogger(__name__)

ROUTE_MARKER = "---ROUTE---"
EVIDENCE_MARKER = "---EVIDENCE---"
VERIFIER_MARKER = "---VERIFIER---"
ANSWER_EVAL_PREVIEW_CHARS = 72
AGENT_EVAL_TIMEOUT_SECS = int(os.environ.get("AGENT_EVAL_TIMEOUT_SECS", "180"))
AGENT_EVAL_MAX_RETRIES = int(os.environ.get("AGENT_EVAL_MAX_RETRIES", "2"))
AGENT_EVAL_RETRY_DELAY_SECS = float(os.environ.get("AGENT_EVAL_RETRY_DELAY_SECS", "2"))
AGENT_EVAL_HEARTBEAT_SECS = float(os.environ.get("AGENT_EVAL_HEARTBEAT_SECS", "30"))
AGENT_EVAL_POLL_SECS = float(os.environ.get("AGENT_EVAL_POLL_SECS", "0.5"))
AGENT_EVAL_ERROR_TAIL_CHARS = int(os.environ.get("AGENT_EVAL_ERROR_TAIL_CHARS", "240"))

RETRYABLE_AGENT_FAILURE_PATTERNS = (
    "policy tool connection failed",
    "policy database connection is down",
    "policy database connection failed",
    "policy database tool is unavailable",
    "database connection error",
    "database is down",
    "couldn't retrieve data from the policy corpus",
    "could not retrieve data from the policy corpus",
)

# Substrings in `candidate_error` that indicate a transient upstream API
# failure (Vercel AI SDK / OpenAI / Anthropic), not a logic bug. These
# produce a non-zero subprocess exit code with no usable answer text, so
# the answer-text pattern match above doesn't catch them.
RETRYABLE_AGENT_ERROR_PATTERNS = (
    "ai_apicallerror",
    '"isretryable": true',
    "'isretryable': true",
    "fetch failed",
    "socket hang up",
    "econnreset",
    "etimedout",
)


def _question_preview(question: str) -> str:
    compact = " ".join(question.split())
    if len(compact) <= ANSWER_EVAL_PREVIEW_CHARS:
        return compact
    return f"{compact[:ANSWER_EVAL_PREVIEW_CHARS - 3]}..."


def extract_answer(stdout: str) -> str:
    """Extract the answer text from agent stdout (text after ---ANSWER--- marker)."""
    marker = "---ANSWER---"
    idx = stdout.find(marker)
    if idx == -1:
        return stdout.strip()
    return stdout[idx + len(marker):].strip()


def _extract_marker_block(stdout: str, start_marker: str, end_markers: tuple[str, ...]) -> dict | None:
    """Parse the last JSON object line in the stdout span between `start_marker`
    and the earliest of `end_markers` that appears after it. Ignores lines that
    decode to non-object values (bare strings, numbers, arrays)."""
    idx = stdout.find(start_marker)
    if idx == -1:
        return None
    start = idx + len(start_marker)
    end = len(stdout)
    for marker in end_markers:
        candidate = stdout.find(marker, start)
        if candidate != -1 and candidate < end:
            end = candidate
    block = stdout[start:end].strip()
    if not block:
        return None
    for line in reversed([line.strip() for line in block.splitlines() if line.strip()]):
        try:
            parsed = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict):
            return parsed
    return None


def extract_route_metadata(stdout: str) -> dict | None:
    # Bound the search by the next marker so an interleaved block isn't
    # accidentally parsed as the route JSON.
    return _extract_marker_block(
        stdout, ROUTE_MARKER, (EVIDENCE_MARKER, VERIFIER_MARKER, "---ANSWER---")
    )


def extract_verifier_metadata(stdout: str) -> dict | None:
    """Extract hallucination-verifier telemetry (printed as a `---VERIFIER---` block)."""
    return _extract_marker_block(stdout, VERIFIER_MARKER, ("---ANSWER---",))


def extract_evidence_metadata(stdout: str) -> dict | None:
    """Extract the agent's tool-sourced evidence payload (``---EVIDENCE---`` block).

    Shape: ``{"sources": [{"toolName", "key", "text"}, ...], "evidence_bytes": int}``.
    The block is printed before ``---VERIFIER---`` / ``---ANSWER---``, so bound
    the search accordingly.
    """
    return _extract_marker_block(
        stdout, EVIDENCE_MARKER, (VERIFIER_MARKER, "---ANSWER---")
    )


def _is_retryable_agent_answer(answer: str) -> bool:
    normalized = " ".join(answer.lower().split())
    return any(pattern in normalized for pattern in RETRYABLE_AGENT_FAILURE_PATTERNS)


def _is_retryable_agent_error(error_message: str | None) -> bool:
    """True when the subprocess error text looks like a transient upstream
    API failure (Vercel AI SDK / provider hiccup). These should be retried
    because the retry cost is bounded and the alternative is a 0/3 score
    on a question that would otherwise succeed."""
    if not error_message:
        return False
    normalized = error_message.lower()
    return any(pattern in normalized for pattern in RETRYABLE_AGENT_ERROR_PATTERNS)


def _tail_text(value: str | None, max_chars: int = AGENT_EVAL_ERROR_TAIL_CHARS) -> str:
    text = (value or "").strip()
    if len(text) <= max_chars:
        return text
    return f"...{text[-max_chars:]}"


def _start_pipe_reader(stream: subprocess.PIPE) -> tuple[list[str], threading.Thread]:
    chunks: list[str] = []

    def _reader() -> None:
        try:
            while True:
                chunk = stream.read(1024)
                if not chunk:
                    break
                chunks.append(chunk)
        finally:
            stream.close()

    thread = threading.Thread(target=_reader, daemon=True)
    thread.start()
    return chunks, thread


def _build_agent_env() -> dict[str, str]:
    agent_env = {**os.environ, "ANTHROPIC_API_KEY": ANTHROPIC_API_KEY, "VOYAGE_API_KEY": VOYAGE_API_KEY}
    agent_env["MASTRA_OBSERVABILITY_PATH"] = agent_env.get("MASTRA_OBSERVABILITY_PATH", ":memory:")

    # Evals run the agent, which calls OpenAI for the model, hallucination
    # verifier, prompt-injection detector, and observational memory. Prefer a
    # dedicated EVAL_OPENAI_API_KEY so a research run cannot drain the
    # production agent's OpenAI quota (which would surface to users as failing
    # chats). Falls back to OPENAI_API_KEY when no separate eval key is set.
    openai_key = os.environ.get("EVAL_OPENAI_API_KEY") or os.environ.get("OPENAI_API_KEY", "")
    if openai_key:
        agent_env["OPENAI_API_KEY"] = openai_key

    agent_model = os.environ.get("AGENT_MODEL", "")
    if agent_model:
        agent_env["AGENT_MODEL"] = agent_model

    return agent_env


def _invoke_agent_cli(question: str, *, progress_label: str | None = None) -> tuple[str, dict | None, dict | None, dict | None]:
    """Fall back to CLI subprocess. Returns (answer, route_info, verifier_info, evidence_info)."""
    agent_env = _build_agent_env()
    agent_env["AGENT_EVAL_CAPTURE_ROUTE"] = "true"

    proc = subprocess.Popen(
        ["npx", "tsx", "src/index.ts", question],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        cwd=str(AGENT_DIR),
        env=agent_env,
        start_new_session=True,
    )

    if getattr(proc, "stdout", None) is None or getattr(proc, "stderr", None) is None:
        try:
            stdout, stderr = proc.communicate(timeout=AGENT_EVAL_TIMEOUT_SECS)
        except subprocess.TimeoutExpired as exc:
            try:
                os.killpg(proc.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            stdout, stderr = proc.communicate()
            exc.stdout = stdout
            exc.stderr = stderr
            raise

        if proc.returncode != 0:
            stderr_tail = _tail_text(stderr)
            stdout_tail = _tail_text(extract_answer(stdout) or stdout)
            details = []
            if stderr_tail:
                details.append(f"stderr_tail={stderr_tail}")
            if stdout_tail:
                details.append(f"stdout_tail={stdout_tail}")
            detail_suffix = f" ({'; '.join(details)})" if details else ""
            raise RuntimeError(f"Agent exited with code {proc.returncode}{detail_suffix}")
        return (
            extract_answer(stdout),
            extract_route_metadata(stdout),
            extract_verifier_metadata(stdout),
            extract_evidence_metadata(stdout),
        )

    assert proc.stdout is not None
    assert proc.stderr is not None
    stdout_chunks, stdout_thread = _start_pipe_reader(proc.stdout)
    stderr_chunks, stderr_thread = _start_pipe_reader(proc.stderr)
    started_at = time.monotonic()
    next_heartbeat_at = started_at + AGENT_EVAL_HEARTBEAT_SECS

    try:
        while proc.poll() is None:
            now = time.monotonic()
            elapsed = now - started_at
            if elapsed >= AGENT_EVAL_TIMEOUT_SECS:
                raise subprocess.TimeoutExpired(proc.args, AGENT_EVAL_TIMEOUT_SECS)

            if progress_label and AGENT_EVAL_HEARTBEAT_SECS > 0 and now >= next_heartbeat_at:
                stdout_chars = sum(len(chunk) for chunk in stdout_chunks)
                stderr_chars = sum(len(chunk) for chunk in stderr_chunks)
                print(
                    f"[answer eval] {progress_label} agent still running elapsed={int(elapsed)}s "
                    f"stdout_chars={stdout_chars} stderr_chars={stderr_chars}",
                    flush=True,
                )
                next_heartbeat_at += AGENT_EVAL_HEARTBEAT_SECS

            time.sleep(AGENT_EVAL_POLL_SECS)
    except subprocess.TimeoutExpired as exc:
        try:
            os.killpg(proc.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        proc.wait(timeout=5)
        stdout_thread.join(timeout=1)
        stderr_thread.join(timeout=1)
        exc.stdout = "".join(stdout_chunks)
        exc.stderr = "".join(stderr_chunks)
        raise
    stdout_thread.join(timeout=1)
    stderr_thread.join(timeout=1)
    stdout = "".join(stdout_chunks)
    stderr = "".join(stderr_chunks)

    if proc.returncode != 0:
        stderr_tail = _tail_text(stderr)
        stdout_tail = _tail_text(extract_answer(stdout) or stdout)
        details = []
        if stderr_tail:
            details.append(f"stderr_tail={stderr_tail}")
        if stdout_tail:
            details.append(f"stdout_tail={stdout_tail}")
        detail_suffix = f" ({'; '.join(details)})" if details else ""
        raise RuntimeError(f"Agent exited with code {proc.returncode}{detail_suffix}")
    return (
        extract_answer(stdout),
        extract_route_metadata(stdout),
        extract_verifier_metadata(stdout),
        extract_evidence_metadata(stdout),
    )


def _invoke_agent(question: str, *, progress_label: str | None = None) -> tuple[str, dict | None, dict | None, dict | None]:
    """Invoke answer eval through the CLI subprocess.

    The CLI emits route, verifier, and tool-evidence marker blocks on stdout.
    The local Mastra HTTP API does not expose those signals, so answer evals
    intentionally avoid the HTTP path even when a dev server is running.
    """
    logger.debug("Invoking answer eval through CLI to preserve verifier/evidence metadata")
    return _invoke_agent_cli(question, progress_label=progress_label)


def _invoke_agent_with_progress(question: str, progress_label: str | None = None) -> tuple[str, dict | None, dict | None, dict | None]:
    """Compatibility wrapper for tests or callers that still monkeypatch a
    narrower ``_invoke_agent``. Always returns a 4-tuple
    ``(answer, route_info, verifier_info, evidence_info)``; shorter tuples
    from legacy monkeypatches are padded with ``None``.
    """
    try:
        result = _invoke_agent(question, progress_label=progress_label)
    except TypeError as exc:
        if "progress_label" not in str(exc):
            raise
        result = _invoke_agent(question)

    if isinstance(result, tuple):
        if len(result) == 4:
            return result  # type: ignore[return-value]
        if len(result) == 3:
            return result[0], result[1], result[2], None
        if len(result) == 2:
            return result[0], result[1], None, None
        if len(result) == 1:
            return result[0], None, None, None
    return result, None, None, None  # type: ignore[return-value]


def _fetch_evidence_sections(primary_sections: list[dict]) -> list[dict]:
    """Fetch ``{section_id, text}`` pairs for the given section IDs from Neo4j.

    Returns the same joined ``title\\ncontent`` string as the legacy helper,
    but keyed by section id so downstream deduplication against the agent's
    ``getSection`` reads is possible.
    """
    sections: list[dict] = []
    with get_session() as session:
        for sec in primary_sections:
            section_id = sec.get("section_id")
            if not section_id:
                continue
            result = session.run(
                "MATCH (s:Section {id: $sid}) RETURN s.content_text AS content, s.title AS title",
                {"sid": section_id},
            )
            record = result.single()
            if record:
                title = record["title"] or ""
                content = record["content"] or ""
                text = f"{title}\n{content}".strip()
                if text:
                    sections.append({"section_id": section_id, "text": text})
    return sections


def evaluate_answers(entries: list[dict], *, use_unified_evidence: bool = True) -> list[dict]:
    """
    Run end-to-end answer quality evaluation for each golden dataset entry.

    For each entry:
    1. Invokes the agent subprocess to get an answer.
    2. Fetches the golden-dataset evidence sections from Neo4j.
    3. Builds the judge evidence bundle. When ``use_unified_evidence`` is True
       (default), the bundle combines golden sections with the agent's
       tool-sourced evidence — the same bundle the hallucination verifier
       sees. When False, legacy behavior: golden sections only.
    4. Calls ``judge_answer()`` to score the response.
    5. Returns per-question results with scores.
    """
    results: list[dict] = []
    total = len(entries)

    for index, entry in enumerate(entries, start=1):
        question = entry["question"]
        golden_answer = entry["answer"]["text"]
        question_id = entry["id"]
        print(
            f"[answer eval] {index}/{total} {question_id} agent start: {_question_preview(question)}",
            flush=True,
        )

        # --- Invoke agent ---
        agent_answer = ""
        agent_error = None
        route_info: dict | None = None
        route_error: str | None = None
        verifier_info: dict | None = None
        evidence_info: dict | None = None
        agent_started_at = time.monotonic()

        for attempt in range(AGENT_EVAL_MAX_RETRIES + 1):
            try:
                (
                    candidate_answer,
                    candidate_route_info,
                    candidate_verifier_info,
                    candidate_evidence_info,
                ) = _invoke_agent_with_progress(
                    question,
                    progress_label=question_id,
                )
                candidate_error = None
                candidate_route_error = None
            except subprocess.TimeoutExpired as exc:
                candidate_answer = ""
                candidate_route_info = extract_route_metadata((getattr(exc, "stdout", "") or ""))
                candidate_verifier_info = extract_verifier_metadata((getattr(exc, "stdout", "") or ""))
                candidate_evidence_info = extract_evidence_metadata((getattr(exc, "stdout", "") or ""))
                tails = []
                stderr_tail = _tail_text(getattr(exc, "stderr", None))
                stdout_tail = _tail_text(extract_answer(getattr(exc, "stdout", "") or ""))
                if stderr_tail:
                    tails.append(f"stderr_tail={stderr_tail}")
                if stdout_tail:
                    tails.append(f"stdout_tail={stdout_tail}")
                tail_suffix = f" ({'; '.join(tails)})" if tails else ""
                candidate_error = f"Agent timed out after {AGENT_EVAL_TIMEOUT_SECS}s{tail_suffix}"
                candidate_route_error = None
            except Exception as exc:
                candidate_answer = ""
                candidate_route_info = None
                candidate_verifier_info = None
                candidate_evidence_info = None
                candidate_error = f"Agent error: {exc}"
                candidate_route_error = None

            retryable_answer = (
                candidate_error is None
                and _is_retryable_agent_answer(candidate_answer)
            )
            retryable_error = _is_retryable_agent_error(candidate_error)
            should_retry = (retryable_answer or retryable_error) and attempt < AGENT_EVAL_MAX_RETRIES
            if should_retry:
                reason = (
                    "transient tool failure in agent answer"
                    if retryable_answer
                    else "transient upstream API error"
                )
                print(
                    f"[answer eval] {question_id} retrying after {reason}",
                    flush=True,
                )
                time.sleep(AGENT_EVAL_RETRY_DELAY_SECS)
                continue

            agent_answer = candidate_answer
            agent_error = candidate_error
            route_info = candidate_route_info
            route_error = candidate_route_error
            verifier_info = candidate_verifier_info
            evidence_info = candidate_evidence_info
            break

        if agent_error:
            print(f"[answer eval] {question_id} agent error: {agent_error}", flush=True)
        else:
            print(f"[answer eval] {question_id} agent complete", flush=True)
        # Be defensive: _extract_marker_block ought to return dict|None, but
        # guard against upstream changes that yield strings or other shapes.
        if not isinstance(route_info, dict):
            route_info = None
        if not isinstance(verifier_info, dict):
            verifier_info = None
        if not isinstance(evidence_info, dict):
            evidence_info = None
        route = (route_info or {}).get("route") or {}
        if not isinstance(route, dict):
            route = {}
        authoritative_document = (route_info or {}).get("authoritative_document") or {}
        if not isinstance(authoritative_document, dict):
            authoritative_document = {}
        if route.get("lane"):
            print(
                f"[answer eval] {question_id} route lane={route.get('lane')} "
                f"policy={authoritative_document.get('policy_number') or authoritative_document.get('title') or 'unknown'} "
                f"widening={route.get('widening_policy')}",
                flush=True,
            )
        agent_elapsed_seconds = round(time.monotonic() - agent_started_at, 3)

        # --- Fetch evidence texts from Neo4j (golden anchor) ---
        primary_sections = entry["evidence"].get("primary_sections", [])
        supporting_sections = entry["evidence"].get("supporting_sections", [])
        all_sections = primary_sections + supporting_sections
        try:
            golden_sections = _fetch_evidence_sections(all_sections)
        except Exception as exc:
            # Don't silently judge against an empty golden anchor — that turns
            # a Neo4j outage into phantom hallucination scores.
            print(
                f"[answer eval] {question_id} WARNING: failed to fetch golden evidence: {exc}",
                flush=True,
            )
            golden_sections = []

        # --- Build the unified judge evidence bundle ---
        # Combines golden anchor sections with the agent's tool-sourced evidence
        # (same bundle the hallucination verifier sees). Aligning the judge's
        # input with the verifier's input removes the false-positive class where
        # the agent correctly cites graph data (e.g. amendment effective_dates)
        # the judge couldn't see.
        agent_sources = ((evidence_info or {}).get("sources") or []) if use_unified_evidence else []
        evidence_bundle = build_judge_evidence(
            golden_sections=golden_sections,
            agent_sources=agent_sources,
        )
        evidence_texts = evidence_bundle.blocks

        # --- Blind citation-support detector (deterministic, no LLM) ---
        # Runs even when the judge errors so we still have grounding signal.
        # Scored against golden-only so the detector's signal stays comparable
        # across runs regardless of how much tool evidence the agent surfaced.
        golden_only_texts = [sec["text"] for sec in golden_sections]
        citation_support = score_citation_support(agent_answer or "", golden_only_texts)

        # --- Score with judge ---
        if agent_error:
            # Infra failure, not answer quality: scoring these 0 conflated
            # timeouts with "major hallucination" and dragged every mean down.
            # None scores are excluded from aggregates (like judge errors) and
            # surface via the agent_errors availability counter instead.
            scores = {
                "factual_accuracy": None,
                "completeness": None,
                "hallucination": None,
                "citation_quality": None,
                "overall": None,
                "explanation": agent_error,
                "error_type": "agent",
            }
        else:
            print(f"[answer eval] {question_id} judge start", flush=True)
            try:
                scores = judge_answer(
                    question=question,
                    golden_answer=golden_answer,
                    agent_answer=agent_answer,
                    evidence_texts=evidence_texts,
                )
            except Exception as exc:
                scores = {
                    "factual_accuracy": None,
                    "completeness": None,
                    "hallucination": None,
                    "citation_quality": None,
                    "overall": None,
                    "explanation": f"Judge error: {exc}",
                    "error_type": "judge",
                }

        # Judge errors get None scores — exclude from aggregates
        is_judge_error = scores.get("error_type") == "judge"
        overall = scores.get("overall")
        completeness = scores.get("completeness")
        factual = scores.get("factual_accuracy")

        results.append({
            "id": question_id,
            "difficulty": entry["difficulty"],
            "reasoning_type": entry["reasoning_type"],
            "question": question,
            "agent_answer": agent_answer,
            "agent_error": agent_error,
            "scores": scores,
            "judge_error": is_judge_error,
            "route_lane": ((route_info or {}).get("route") or {}).get("lane"),
            "route_rationale": ((route_info or {}).get("route") or {}).get("rationale"),
            "route_widening_policy": ((route_info or {}).get("route") or {}).get("widening_policy"),
            "route_determinism_hints": ((route_info or {}).get("route") or {}).get("determinism_hints"),
            "route_authoritative_document": (route_info or {}).get("authoritative_document"),
            "route_widened": (((route_info or {}).get("route") or {}).get("widening_policy") or "none") != "none",
            "route_inspection_error": route_error,
            "verifier": verifier_info,
            "citation_support": citation_support,
            "agent_evidence": {
                "source_count": len((evidence_info or {}).get("sources") or []),
                "total_bytes": (evidence_info or {}).get("evidence_bytes") or 0,
                "sources": (evidence_info or {}).get("sources") or [],
            },
            "judge_evidence_stats": {
                "sources_used": evidence_bundle.sources_used,
                "golden_blocks_used": evidence_bundle.golden_blocks_used,
                "bytes_in_prompt": evidence_bundle.bytes_in_prompt,
                "budget_trimmed": evidence_bundle.budget_trimmed,
                "evidence_mode": "unified" if use_unified_evidence else "legacy",
            },
            "agent_elapsed_seconds": agent_elapsed_seconds,
            # Alias fields for results.py aggregate compatibility
            # None values signal "exclude from aggregates"
            "precision": (overall / 3.0) if overall is not None else None,
            "recall": (completeness / 3.0) if completeness is not None else None,
            "mrr": (factual / 3.0) if factual is not None else None,
            "primary_hit": (overall >= 2) if overall is not None else None,
        })

        if is_judge_error:
            print(f"[answer eval] {question_id} judge error", flush=True)
        else:
            score_display = "n/a" if overall is None else f"{overall}/3"
            print(f"[answer eval] {question_id} complete overall={score_display}", flush=True)

    return results
