"""Level 3: End-to-end answer quality evaluation."""

import os
import subprocess

from pipeline.config import ANTHROPIC_API_KEY, VOYAGE_API_KEY, AGENT_DIR
from pipeline.graph.connection import get_session
from pipeline.eval.judge import judge_answer


def extract_answer(stdout: str) -> str:
    """Extract the answer text from agent stdout (text after ---ANSWER--- marker)."""
    marker = "---ANSWER---"
    idx = stdout.find(marker)
    if idx == -1:
        return stdout.strip()
    return stdout[idx + len(marker):].strip()


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
        agent_env = {**os.environ, "ANTHROPIC_API_KEY": ANTHROPIC_API_KEY, "VOYAGE_API_KEY": VOYAGE_API_KEY}
        agent_answer = ""
        agent_error = None

        try:
            proc = subprocess.run(
                ["npx", "tsx", "src/index.ts", question],
                capture_output=True,
                text=True,
                timeout=180,
                cwd=str(AGENT_DIR),
                env=agent_env,
            )
            if proc.returncode != 0:
                agent_error = f"Agent exited with code {proc.returncode}: {proc.stderr[:500]}"
                agent_answer = ""
            else:
                agent_answer = extract_answer(proc.stdout)
        except subprocess.TimeoutExpired:
            agent_error = "Agent subprocess timed out after 180s"
        except Exception as exc:
            agent_error = f"Agent subprocess error: {exc}"

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
                    "factual_accuracy": 0,
                    "completeness": 0,
                    "hallucination": 0,
                    "citation_quality": 0,
                    "overall": 0,
                    "explanation": f"Judge error: {exc}",
                }

        results.append({
            "id": entry["id"],
            "difficulty": entry["difficulty"],
            "reasoning_type": entry["reasoning_type"],
            "question": question,
            "agent_answer": agent_answer,
            "agent_error": agent_error,
            "scores": scores,
            # Alias fields for results.py aggregate compatibility
            "precision": scores.get("overall", 0) / 3.0,
            "recall": scores.get("completeness", 0) / 3.0,
            "mrr": scores.get("factual_accuracy", 0) / 3.0,
            "primary_hit": scores.get("overall", 0) >= 2,
        })

    return results
