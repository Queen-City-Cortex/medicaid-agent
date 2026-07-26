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
release_build_graph
release_validate
release_mark_promoted
release_mark_rolled_back
release_mark_cutover_restored
release_mark_recovery_pending
release_event
release_mark_graph
release_retention_check
release_cleanup_candidate
release_check_rollback
release_mark_service_stopped

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
