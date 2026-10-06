"""Release inputs that can be checked before the candidate graph is reset.

`release-validate` remains the gate. This runs first, on the prepared manifest,
so an input that would fail the release after the wipe, the embedding pass and
the evaluations stops it while the inactive graph is still untouched.
"""

from __future__ import annotations

import json
import os
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from pipeline.release import (
    apply_overrides,
    baseline_comparison_gaps,
    evaluate_release_manifest,
    load_json_object,
    load_release_policy,
    release_policy_hash,
    unresolved_gate_failures,
    utc_now,
)


# `release-preflight` exits with this status when the snapshot was already
# rejected and nothing that decides the outcome has changed. The corpus job
# (RELEASE_ALREADY_REJECTED_EXIT in scripts/ops/railway-corpus-job.sh) skips
# the rebuild, finishes its mirror and backup, and ends with it.
ALREADY_REJECTED_EXIT_CODE = 21

# `release-preflight` exits with this status when the release being replaced is
# promoted and was built from this same source snapshot with this same
# evaluation fingerprint: the previous run promoted it and stopped before the
# snapshot was acknowledged. The corpus job (RELEASE_ALREADY_RELEASED_EXIT)
# acknowledges the snapshot and rebuilds nothing. 20 is the deferred reset.
ALREADY_RELEASED_EXIT_CODE = 22

# The one gate decided by the clock and not by the snapshot, code or policy:
# discovery timestamps are outside the source snapshot hash, so a release
# rejected only for staleness can pass after the next crawl.
_TIME_DEPENDENT_GATES = frozenset({"freshnessSla"})


class PreflightFailed(Exception):
    """One or more release inputs would fail the release; each says what to fix."""

    def __init__(self, problems: list[str]) -> None:
        super().__init__("; ".join(problems))
        self.problems = problems


class SnapshotAlreadyRejected(Exception):
    """An identical release was already rejected at a gate."""

    def __init__(self, rejection: dict[str, Any]) -> None:
        super().__init__(
            f"Source snapshot {rejection['sourceSnapshotHash']} was already "
            f"rejected as release {rejection['releaseId']} by: "
            f"{', '.join(rejection['failedGates'])}"
        )
        self.rejection = rejection


class SnapshotAlreadyReleased(Exception):
    """The serving release was built from this snapshot with this code."""

    def __init__(self, release_id: str, snapshot: str) -> None:
        super().__init__(
            f"Source snapshot {snapshot} is already promoted as release {release_id}"
        )
        self.release_id = release_id


def required_family_freshness(
    source_freshness: list[dict[str, Any]],
    *,
    now: datetime | None = None,
) -> list[dict[str, Any]]:
    """Discovery age of each family required for answering, by the audit's rule.

    A family is fresh while its last successful discovery is no older than its
    `freshness_sla_days`; a family never discovered is not fresh. The audit
    (`build_corpus_audit_report`) decides the `freshnessSla` gate the same way
    after the build, and a pipeline test holds the two together.
    """
    from pipeline.corpus_manifest import CORPUS_MANIFEST

    effective_now = (now or utc_now()).astimezone(UTC)
    discovered = {
        str(row.get("source_type")): row.get("last_successful_discovery_at")
        for row in source_freshness
    }
    families = []
    for family in CORPUS_MANIFEST.source_families:
        if not family.required_for_answering:
            continue
        last_discovery = discovered.get(family.source_type)
        age_days = None
        if last_discovery:
            checked_at = datetime.fromisoformat(
                str(last_discovery).replace("Z", "+00:00")
            )
            if checked_at.tzinfo is None:
                checked_at = checked_at.replace(tzinfo=UTC)
            age_days = (effective_now - checked_at.astimezone(UTC)).total_seconds() / 86_400
        families.append(
            {
                "sourceType": family.source_type,
                "lastSuccessfulDiscoveryAt": last_discovery,
                "ageDays": age_days,
                "freshnessSlaDays": family.freshness_sla_days,
                "fresh": age_days is not None
                and age_days <= family.freshness_sla_days,
            }
        )
    return families


def graph_independent(fingerprint: Any) -> Any:
    """A recorded evaluation fingerprint without the values read from its graph.

    Those values exist only once a graph is built, so they cannot be compared
    before the build. `evaluation_fingerprint(read_graph=False)` returns the
    same shape for the current configuration.
    """
    if not isinstance(fingerprint, dict):
        return fingerprint
    comparable = {
        key: value
        for key, value in fingerprint.items()
        if key != "validationCorpusHash"
    }
    if isinstance(comparable.get("jev"), dict):
        comparable["jev"] = {**comparable["jev"], "annotationDigest": None}
    return comparable


def find_matching_rejection(
    releases_dir: Path,
    manifest: dict[str, Any],
    *,
    fingerprint: dict[str, Any],
    policy_hash: str,
    overrides: dict[str, Any],
    retry_rejected: str | None = None,
) -> dict[str, Any] | None:
    """The newest earlier release rejected for reasons this build would repeat.

    A rejection repeats when the source snapshot, the evaluation fingerprint
    (which carries the code, benchmark, catalog and model configuration) and
    the release policy are all unchanged, and at least one gate it failed is
    neither decided by the clock nor waived by an override this run carries.
    `retry_rejected` allows one more build only when it names that newest
    rejection: after the retry is rejected too, the operator must name the new
    one, and an older name left in place allows nothing.
    """
    matches = []
    for path in sorted(releases_dir.glob("*.json")):
        try:
            earlier = load_json_object(path)
        except (OSError, ValueError, json.JSONDecodeError):
            continue
        if (
            earlier.get("promotionState") != "rejected"
            or earlier.get("releaseId") == manifest.get("releaseId")
            or earlier.get("sourceSnapshotHash") != manifest.get("sourceSnapshotHash")
            or earlier.get("releasePolicyHash") != policy_hash
            or graph_independent(earlier.get("evaluationFingerprint")) != fingerprint
        ):
            continue
        failed = [
            name
            for name in unresolved_gate_failures(earlier.get("gates"))
            if name not in _TIME_DEPENDENT_GATES and name not in overrides
        ]
        if failed:
            matches.append(
                {
                    "releaseId": earlier.get("releaseId"),
                    "manifestPath": str(path),
                    "sourceSnapshotHash": earlier.get("sourceSnapshotHash"),
                    "validatedAt": earlier.get("validatedAt") or "",
                    "failedGates": failed,
                }
            )
    newest = max(matches, key=lambda item: item["validatedAt"], default=None)
    if newest and retry_rejected and newest["releaseId"] == retry_rejected:
        return None
    return newest


def _catalog_problem() -> str | None:
    catalog_path = os.environ.get("EVAL_IDENTITY_CATALOG")
    if not catalog_path:
        return (
            "EVAL_IDENTITY_CATALOG is not set: set it on the corpus job to the "
            "frozen evidence identity catalog (eval-identity-catalog writes it)"
        )
    try:
        catalog = json.loads(Path(catalog_path).read_text())
    except (OSError, ValueError) as error:
        return (
            f"EVAL_IDENTITY_CATALOG ({catalog_path}) cannot be read as JSON "
            f"({type(error).__name__}): regenerate it with eval-identity-catalog"
        )
    if not isinstance(catalog, dict) or not isinstance(catalog.get("sections"), list):
        return (
            f"EVAL_IDENTITY_CATALOG ({catalog_path}) has no `sections` list: "
            "regenerate it with eval-identity-catalog"
        )
    return None


def run_release_preflight(
    manifest_path: Path,
    *,
    releases_dir: Path,
    previous_manifest_path: Path | None = None,
    baseline_evidence_path: Path | None = None,
    override_path: Path | None = None,
    retry_rejected: str | None = None,
    now: datetime | None = None,
) -> dict[str, Any]:
    """Check every release input that needs no graph.

    Raises `PreflightFailed` with every problem found, or
    `SnapshotAlreadyRejected` when the inputs are sound but the same release
    was already rejected. Returns what was checked otherwise.
    """
    from pipeline.crawler_registry import read_source_freshness
    from pipeline.evaluation_evidence import (
        evaluation_fingerprint,
        require_complete_results,
    )

    problems: list[str] = []
    notices: list[str] = []
    previous: dict[str, Any] | None = None
    manifest = load_json_object(manifest_path)
    snapshot = manifest["sourceSnapshotHash"]
    try:
        policy = load_release_policy()
    except (OSError, ValueError) as error:
        raise PreflightFailed(
            [f"corpus-release-policy.json is not usable: {error}"]
        ) from error

    fingerprint = None
    catalog_problem = _catalog_problem()
    if catalog_problem:
        problems.append(catalog_problem)
    else:
        try:
            fingerprint = evaluation_fingerprint(read_graph=False)
        except (OSError, ValueError, KeyError) as error:
            problems.append(f"The evaluation fingerprint cannot be computed: {error}")

    if bool(previous_manifest_path) == bool(baseline_evidence_path):
        problems.append(
            "A release is compared with exactly one baseline: the previous "
            "release manifest, or at bootstrap the legacy baseline evidence"
        )
    elif previous_manifest_path:
        previous = load_json_object(previous_manifest_path)
        missing = baseline_comparison_gaps(previous)
        if missing:
            problems.append(
                f"The previous release manifest {previous_manifest_path} has no "
                f"value for {', '.join(missing)}, so those regression gates "
                "cannot pass: compare with a manifest that was fully validated"
            )
    elif fingerprint is not None:
        baseline = load_json_object(baseline_evidence_path)
        if (
            baseline.get("schemaVersion") != 1
            or graph_independent(baseline.get("fingerprint")) != fingerprint
        ):
            problems.append(
                f"The baseline evidence {baseline_evidence_path} was measured "
                "with a different benchmark, code revision, catalog or model "
                "configuration: run release-baseline again with this "
                "configuration, or restore the configuration it was run with"
            )
        else:
            try:
                require_complete_results(
                    baseline.get("retrieval") or {}, baseline.get("answer") or {}
                )
            except (ValueError, KeyError, TypeError) as error:
                problems.append(
                    f"The baseline evidence {baseline_evidence_path} is not "
                    f"complete release evidence ({error}): run release-baseline again"
                )
            if "jev" in fingerprint or "validationPricingHash" in fingerprint:
                # release-validate compares the whole fingerprint, including
                # the two values read from each graph. They are unknown for a
                # graph that is not built yet, so this cannot be checked here.
                notices.append(
                    "Jev is enabled: release-validate also requires the "
                    "baseline's Jev annotation digest and validation corpus "
                    "hash to equal the candidate graph's, which cannot be "
                    "checked before the build. A baseline taken on a graph "
                    "with different annotations will be rejected after it"
                )

    overrides: dict[str, Any] = {}
    if override_path:
        try:
            overrides = load_json_object(override_path)
            # An empty manifest yields every gate, failing: enough to check the
            # names, the snapshot binding and the reasons.
            apply_overrides(evaluate_release_manifest({}, policy), overrides, snapshot)
        except (OSError, ValueError) as error:
            overrides = {}
            problems.append(
                f"The override file {override_path} is not valid for this "
                f"release ({error}): correct it or unset RELEASE_OVERRIDE_FILE"
            )

    freshness = required_family_freshness(read_source_freshness(), now=now)
    stale = [family for family in freshness if not family["fresh"]]
    if stale and "freshnessSla" not in overrides:
        described = ", ".join(
            f"{family['sourceType']} "
            + (
                f"(last discovered {family['lastSuccessfulDiscoveryAt']}, "
                f"{family['ageDays']:.1f} days ago; limit "
                f"{family['freshnessSlaDays']})"
                if family["ageDays"] is not None
                else "(never discovered)"
            )
            for family in stale
        )
        problems.append(
            f"Required source families are stale: {described}. Run a full crawl "
            "(CORPUS_JOB_MODE=discover), or write a freshnessSla override bound "
            f"to source snapshot {snapshot}"
        )

    if problems:
        raise PreflightFailed(problems)

    if (
        previous is not None
        and previous.get("promotionState") == "promoted"
        and previous.get("sourceSnapshotHash") == snapshot
        and graph_independent(previous.get("evaluationFingerprint")) == fingerprint
    ):
        raise SnapshotAlreadyReleased(str(previous.get("releaseId")), snapshot)

    rejection = find_matching_rejection(
        releases_dir,
        manifest,
        fingerprint=fingerprint,
        policy_hash=release_policy_hash(),
        overrides=overrides,
        retry_rejected=retry_rejected,
    )
    if rejection:
        raise SnapshotAlreadyRejected(rejection)
    return {
        "sourceSnapshotHash": snapshot,
        "releasePolicyHash": release_policy_hash(),
        "overriddenGates": sorted(overrides),
        "retryOfRejectedRelease": retry_rejected,
        "requiredFamilyFreshness": freshness,
        "notices": notices,
    }
