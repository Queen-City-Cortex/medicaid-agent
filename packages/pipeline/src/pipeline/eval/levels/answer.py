"""Level 3: End-to-end answer quality evaluation."""

import json
import os
import signal
import subprocess
import logging
import threading
import time

import httpx

from pipeline.config import ANTHROPIC_API_KEY, VOYAGE_API_KEY, AGENT_DIR
from pipeline.graph.connection import get_session
from pipeline.eval.judge import judge_answer
from pipeline.eval.citation import score_citation_support

logger = logging.getLogger(__name__)

AGENT_API_URL = "http://localhost:4111/api/agents/ncMedicaidAgent/generate"
ROUTE_MARKER = "---ROUTE---"
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
    # Bound the search by the next marker so an interleaved `---VERIFIER---`
    # block isn't accidentally parsed as the route JSON.
    return _extract_marker_block(stdout, ROUTE_MARKER, (VERIFIER_MARKER, "---ANSWER---"))


def extract_verifier_metadata(stdout: str) -> dict | None:
    """Extract hallucination-verifier telemetry (printed as a `---VERIFIER---` block)."""
    return _extract_marker_block(stdout, VERIFIER_MARKER, ("---ANSWER---",))


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


def _invoke_agent_http(question: str, *, progress_label: str | None = None) -> tuple[str, dict | None, dict | None]:
    """Call the agent via HTTP API (requires `mastra dev` running on port 4111).

    Returns (answer, route_info, verifier_info). HTTP path cannot read the ---VERIFIER---
    stdout marker, so verifier_info is always None here — use CLI fallback for verifier telemetry.
    """
    resp = httpx.post(
        AGENT_API_URL,
        json={"messages": [{"role": "user", "content": question}]},
        timeout=AGENT_EVAL_TIMEOUT_SECS,
    )
    resp.raise_for_status()
    return resp.json().get("text", ""), None, None


def _build_agent_env() -> dict[str, str]:
    agent_env = {**os.environ, "ANTHROPIC_API_KEY": ANTHROPIC_API_KEY, "VOYAGE_API_KEY": VOYAGE_API_KEY}
    agent_env["MASTRA_OBSERVABILITY_PATH"] = agent_env.get("MASTRA_OBSERVABILITY_PATH", ":memory:")

    openai_key = os.environ.get("OPENAI_API_KEY", "")
    if openai_key:
        agent_env["OPENAI_API_KEY"] = openai_key

    agent_model = os.environ.get("AGENT_MODEL", "")
    if agent_model:
        agent_env["AGENT_MODEL"] = agent_model

    return agent_env


def _invoke_agent_cli(question: str, *, progress_label: str | None = None) -> tuple[str, dict | None, dict | None]:
    """Fall back to CLI subprocess. Returns (answer, route_info, verifier_info)."""
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
        return extract_answer(stdout), extract_route_metadata(stdout), extract_verifier_metadata(stdout)

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
    return extract_answer(stdout), extract_route_metadata(stdout), extract_verifier_metadata(stdout)


def _invoke_agent(question: str, *, progress_label: str | None = None) -> tuple[str, dict | None, dict | None]:
    """Invoke agent via HTTP API, falling back to CLI subprocess.

    Returns (answer, route_info, verifier_info).
    """
    try:
        return _invoke_agent_http(question, progress_label=progress_label)
    except (httpx.ConnectError, httpx.HTTPError):
        logger.info("Agent HTTP API not available, falling back to CLI subprocess")
        return _invoke_agent_cli(question, progress_label=progress_label)


def _invoke_agent_with_progress(question: str, progress_label: str | None = None) -> tuple[str, dict | None, dict | None]:
    """Compatibility wrapper for tests or callers that still monkeypatch a one-arg _invoke_agent.

    Returns (answer, route_info, verifier_info). Older monkeypatches that return 2-tuples
    or plain strings are padded to the 3-tuple shape.
    """
    try:
        result = _invoke_agent(question, progress_label=progress_label)
    except TypeError as exc:
        if "progress_label" not in str(exc):
            raise
        result = _invoke_agent(question)

    if isinstance(result, tuple):
        if len(result) == 3:
            return result  # type: ignore[return-value]
        if len(result) == 2:
            return result[0], result[1], None
        if len(result) == 1:
            return result[0], None, None
    return result, None, None  # type: ignore[return-value]


def _fetch_evidence_texts(primary_sections: list[dict]) -> list[str]:
    """Fetch content for the given section IDs from Neo4j."""
    texts: list[str] = []
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
                texts.append(f"{title}\n{content}".strip())
    return texts


def evaluate_answers(entries: list[dict]) -> list[dict]:
    """
    Run end-to-end answer quality evaluation for each golden dataset entry.

    For each entry:
    1. Invokes the agent subprocess to get an answer.
    2. Fetches evidence section texts from Neo4j.
    3. Calls judge_answer() to score the response.
    4. Returns per-question results with scores.
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
        agent_started_at = time.monotonic()

        for attempt in range(AGENT_EVAL_MAX_RETRIES + 1):
            try:
                (
                    candidate_answer,
                    candidate_route_info,
                    candidate_verifier_info,
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
                tails = []
                stderr_tail = _tail_text(getattr(exc, "stderr", None))
                stdout_tail = _tail_text(extract_answer(getattr(exc, "stdout", "") or getattr(exc, "stdout", "")))
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

        # --- Fetch evidence texts from Neo4j ---
        primary_sections = entry["evidence"].get("primary_sections", [])
        supporting_sections = entry["evidence"].get("supporting_sections", [])
        all_sections = primary_sections + supporting_sections
        try:
            evidence_texts = _fetch_evidence_texts(all_sections)
        except Exception:
            evidence_texts = []

        # --- Blind citation-support detector (deterministic, no LLM) ---
        # Runs even when the judge errors so we still have grounding signal.
        citation_support = score_citation_support(agent_answer or "", evidence_texts)

        # --- Score with judge ---
        if agent_error:
            scores = {
                "factual_accuracy": 0,
                "completeness": 0,
                "hallucination": 0,
                "citation_quality": 0,
                "overall": 0,
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
