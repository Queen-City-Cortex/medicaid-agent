"""LLM-as-judge wrapper (stub — requires Layer 3 agent)."""


def judge_answer(question: str, golden_answer: str, agent_answer: str, evidence_texts: list[str]) -> dict:
    """Stub: will use Claude to judge answer quality when Layer 3 is built."""
    raise NotImplementedError("LLM-as-judge requires the agent from Layer 3")
