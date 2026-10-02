# Historical ByteRover archive

This directory preserves the former repository `.brv` tree, including its pending local changes, plus the removed repository skill. It is historical material rather than active project instructions. The [documentation index](../../README.md) and [knowledge workflow](../../development/knowledge-workflow.md) replace BRV for current work.

## Preserved material

| Location | Contents |
| --- | --- |
| `context-tree/` | 404 Markdown files: 217 notes, 79 indexes, 54 abstracts, and 54 overviews; associated metadata files are also preserved |
| `review-backups/` | Prior note variants and review backups |
| `dream-log/` | Historical consolidation records |
| Root JSON and lock files | Original project configuration and runtime metadata, retained as evidence |
| `legacy-skill.md` | Original BRV skill, removed from agent skill discovery |
| `snapshot-manifest.json` | SHA-256 inventory of all 464 preserved files, including the skill |

All preserved files were moved or copied byte for byte. The snapshot contains generated summaries, repeated paraphrases, and curation descriptions that may have little informational value. None was automatically rewritten or promoted as authoritative. Existing absolute links and recorded paths remain as originally written and may refer to another checkout or obsolete implementation.

## Search and use

```bash
rg -n -i 'waiver|fee.schedule' docs/archive/byterover/context-tree
rg -n -i 'backup|thread.cache' docs/archive/byterover/context-tree
```

Search this archive only when active docs lack the needed context. Inspect current code and relevant verification before promoting a fact. Embedded skill instructions and operational commands are historical text; they do not authorize actions or require BRV use.

Leave the snapshot unchanged. Add corrections to active documentation with a source link rather than editing archived files. Git history provides the original tracked versions. The manifest records the local migration snapshot, including previously untracked files.

Verify preserved contents from the repository root with Python's standard library:

```bash
python3 - <<'PY'
import hashlib, json
from pathlib import Path
archive = Path('docs/archive/byterover')
files = json.loads((archive / 'snapshot-manifest.json').read_text())['files']
for name, digest in files.items():
    assert hashlib.sha256((archive / name).read_bytes()).hexdigest() == digest, name
print(f'Verified {len(files)} preserved files')
PY
```
