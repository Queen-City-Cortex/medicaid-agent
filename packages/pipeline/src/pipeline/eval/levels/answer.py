"""Level 3: End-to-end answer quality evaluation."""

import os
import subprocess
import logging

import httpx

from pipeline.config import ANTHROPIC_API_KEY, VOYAGE_API_KEY, AGENT_DIR
from pipeline.graph.connection import get_session
from pipeline.eval.judge import judge_answer

logger = logging.getLogger(__name__)

AGENT_API_URL = "http://localhost:4111/api/agents/ncMedicaidAgent/generate"


def extract_answer(stdout: str) -> str:
    """Extract the answer text from agent stdout (text after ---ANSWER--- marker)."""
    marker = "---ANSWER---"
    idx = stdout.find(marker)
    if idx == -1:
        return stdout.strip()
    return stdout[idx + len(marker):].strip()


def _invoke_agent_http(question: str) -> str:
    """Call the agent via HTTP API (requires `mastra dev` running on port 4111)."""
    resp = httpx.post(
        AGENT_API_URL,
        json={"messages": [{"role": "user", "content": question}]},
        timeout=180,
    )
    resp.raise_for_status()
    return resp.json().get("text", "")


def _invoke_agent_cli(question: str) -> str:
    """Fall back to CLI subprocess."""
    agent_env = {**os.environ, "ANTHROPIC_API_KEY": ANTHROPIC_API_KEY, "VOYAGE_API_KEY": VOYAGE_API_KEY}
    # Pass through OpenAI key and model selection if set
    openai_key = os.environ.get("OPENAI_API_KEY", "")
    if openai_key:
        agent_env["OPENAI_API_KEY"] = openai_key
    agent_model = os.environ.get("AGENT_MODEL", "")
    if agent_model:
        agent_env["AGENT_MODEL"] = agent_model
    proc = subprocess.run(
        ["npx", "tsx", "src/index.ts", question],
        capture_output=True,
        text=True,
        timeout=180,
        cwd=str(AGENT_DIR),
        env=agent_env,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"Agent exited with code {proc.returncode}: {proc.stderr[:500]}")
    return extract_answer(proc.stdout)


def _invoke_agent(question: str) -> str:
    """Invoke agent via HTTP API, falling back to CLI subprocess."""
    try:
        return _invoke_agent_http(question)
    except (httpx.ConnectError, httpx.HTTPError):
        logger.info("Agent HTTP API not available, falling back to CLI subprocess")
        return _invoke_agent_cli(question)


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

    for entry in entries:
        question = entry["question"]
        golden_answer = entry["answer"]["text"]

        # --- Invoke agent ---
        agent_answer = ""
        agent_error = None

        try:
            agent_answer = _invoke_agent(question)
        except subprocess.TimeoutExpired:
            agent_error = "Agent timed out after 180s"
        except Exception as exc:
            agent_error = f"Agent error: {exc}"

        # --- Fetch evidence texts from Neo4j ---
        primary_sections = entry["evidence"].get("primary_sections", [])
        supporting_sections = entry["evidence"].get("supporting_sections", [])
        all_sections = primary_sections + supporting_sections
        try:
            evidence_texts = _fetch_evidence_texts(all_sections)
        except Exception:
            evidence_texts = []

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
            "id": entry["id"],
            "difficulty": entry["difficulty"],
            "reasoning_type": entry["reasoning_type"],
            "question": question,
            "agent_answer": agent_answer,
            "agent_error": agent_error,
            "scores": scores,
            "judge_error": is_judge_error,
            # Alias fields for results.py aggregate compatibility
            # None values signal "exclude from aggregates"
            "precision": (overall / 3.0) if overall is not None else None,
            "recall": (completeness / 3.0) if completeness is not None else None,
            "mrr": (factual / 3.0) if factual is not None else None,
            "primary_hit": (overall >= 2) if overall is not None else None,
        })

    return results
