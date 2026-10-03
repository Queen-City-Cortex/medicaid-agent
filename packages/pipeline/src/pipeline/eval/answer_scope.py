"""Mandatory repeated live answer checks for a corpus with approved limitations."""

from __future__ import annotations

from pipeline.answer_scope import implementation_hash, scope_policy
from pipeline.source_lifecycle import stable_hash

CASES = [
    (
        "magi-2026",
        "In the MAGI table applicable in October 2026, what is the listed monthly 133% Medicaid expansion income amount for a household of one, before the five-percent disregard? Include the table's effective date.",
        "passed",
        ["1,769", "2026"],
    ),
    (
        "magi-2025",
        "In the MAGI table applicable in June 2025, what is the listed monthly 133% Medicaid expansion income amount for a household of one, before the five-percent disregard? Include the table's effective date.",
        "passed",
        ["1,735", "2025"],
    ),
    (
        "magi-before-april-2025",
        "What MAGI income table and limits apply in February 2025?",
        "withheld",
        [],
    ),
    (
        "magi-missing-archives",
        "Were the two archived 2025 MAGI income-limit wrappers duplicates, and what were their exact original contents?",
        "withheld",
        [],
    ),
    (
        "dhb-5097-procedure",
        "What is the purpose of DHB-5097 Request for Information? Can a blank form establish my individual response deadline?",
        "passed",
        [],
    ),
    (
        "gujarati-official-form",
        "Download and quote the official Gujarati DHB-5097 form.",
        "withheld",
        [],
    ),
    (
        "covid-payment-after-2024",
        "Did Medicaid pharmacy POS payment coverage for OTC COVID-19 home tests continue after October 1, 2024?",
        "passed",
        ["2024"],
    ),
    (
        "covid-standing-order-authority",
        "What exact dispensing authority does the pharmacist standing order for OTC COVID-19 home tests grant, and was that order withdrawn?",
        "withheld",
        [],
    ),
]


def run_scope_acceptance(source_snapshot_hash: str, *, invoke=None) -> dict:
    from pipeline.eval.levels.answer import _invoke_agent_cli
    from pipeline.evaluation_evidence import evaluation_fingerprint

    invoke = invoke or _invoke_agent_cli
    policy = scope_policy()
    if {case[0] for case in CASES} != set(policy["qualification_cases"]):
        raise ValueError("Scope acceptance cases differ from the reviewed policy")
    runs = []
    for repeat in range(2):
        for case_id, question, expected, figures in CASES:
            answer, route, verifier, evidence = invoke(
                question, progress_label=f"scope {repeat + 1}/2 {case_id}"
            )
            verifier = verifier or {}
            status = verifier.get("outcome", {}).get("status")
            good = (
                bool(answer.strip())
                and verifier.get("coverage_policy_id") == policy["id"]
                and not verifier.get("verifier_unavailable")
            )
            if expected == "withheld":
                good = (
                    good
                    and status == "withheld"
                    and bool(verifier.get("coverage_issue"))
                    and verifier.get("pass_count") == 0
                )
            else:
                good = (
                    good
                    and status in {"passed", "corrected"}
                    and verifier.get("supported") is True
                    and verifier.get("citations_complete") is True
                    and verifier.get("coverage_issue") is None
                    and all(
                        figure.replace(",", "") in answer.replace(",", "")
                        for figure in figures
                    )
                )
            runs.append(
                {
                    "case_id": case_id,
                    "repeat": repeat + 1,
                    "passed": good,
                    "answer": answer,
                    "route": route,
                    "verifier": verifier,
                    "evidence": evidence,
                }
            )
    return {
        "policy_hash": stable_hash(policy),
        "implementation_hash": implementation_hash(),
        "source_snapshot_hash": source_snapshot_hash,
        "evaluation_fingerprint": evaluation_fingerprint(),
        "all_passed": all(run["passed"] for run in runs),
        "runs": runs,
    }
