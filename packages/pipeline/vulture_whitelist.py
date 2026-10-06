# Vulture whitelist — known false positives for `vulture src`.
#
# Vulture can't see dynamic/framework usage, so it flags entrypoints and
# library-driven attributes as dead. Each entry below is a CONFIRMED false
# positive (verified used via CLI registration, stdlib/framework call, tests,
# or a JSON-backed data schema). Run dead-code detection with:
#
#     vulture src vulture_whitelist.py
#
# Genuinely-dead code is deliberately NOT listed here — keep it surfacing so it
# can be removed rather than silenced. Regenerate a candidate list with
# `vulture src --make-whitelist`, then triage before adding entries.

# --- Click CLI commands (registered dynamically via @cli.command / @click) ---
audit_corpus
fee_schedule_backlog
load
run_all
schema_version_cmd
build_mixed_corpus
eval
eval_mixed_corpus
eval_compare
eval_runs
eval_answer_stability
eval_validate
eval_validate_golden
eval_identity_catalog
source_audit
ingest_cfr
ingest_ssa
inspect
extract_refs
unresolved_refs
seed_concepts_cmd
link_concepts_cmd
detect_amendments_cmd
answer_ready_snapshot
acknowledge_answer_ready_snapshot_command
release_prepare
release_preflight
release_build_graph
release_validate
release_mark_promoted
release_mark_cutover_started
release_mark_rolled_back
release_mark_cutover_restored
release_mark_recovery_pending
release_event
release_mark_graph
release_retention_check
release_cleanup_candidate
release_check_rollback
release_mark_service_stopped

# --- SSA <-> USC section tables, kept for U.S.C. citation extraction (DATA-17, #350) ---
SSA_TO_USC
USC_TO_SSA

# --- html.parser.HTMLParser overrides (called by the stdlib parser) ---
_.handle_starttag
_.handle_endtag
_.handle_data
attrs  # handle_starttag(self, tag, attrs) — signature fixed by the base class

# --- Library/driver attributes set on framework objects ---
_.row_factory            # sqlite3.Connection.row_factory
_.do_ocr                 # docling PdfPipelineOptions
_.do_table_structure     # docling PdfPipelineOptions
_.table_structure_options

# --- Referenced only by tests or other callers vulture's src-only scan misses ---
close_driver
_parse_response
primary_hit_rate

# --- SourceFamilyManifest schema fields (populated from corpus-manifest.json) ---
allowed_domains
allowed_file_formats
landing_pages
seed_urls
discovery_interval_hours
freshness_sla_days
refresh_interval_hours
federal_sources

# Click-registered corpus recovery and initial activation commands.
from pipeline.cli.recovery import parse_import, retire, recovery_inventory, source_scope
from pipeline.cli.release import release_baseline, release_activate_bootstrap
parse_import
retire
release_baseline
release_activate_bootstrap
recovery_inventory
source_scope  # Click registers this guarded operator command dynamically.

# Called by the offline operational inspector outside src/.
measure_embedding_plan

# Operational inspector proves retained parse provenance without mutating corpus.
reconcile_parse_orphans

# Jev Click commands registered via decorators.
jev_commands
jev_prepare
jev_run
jev_review
jev_report
jev_enrich
jev_compare_answers
jev_validate_answers
jev_frames
jev_review_dashboard
jev_snapshot
jev_ai_draft
jev_ai_audit
jev_import_ai_audit

# Called by system-Python backup snapshot and restoration scripts outside src/.
validate_release_label_references  # noqa: F821
