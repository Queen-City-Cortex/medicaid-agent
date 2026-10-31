# NC Medicaid Navigator

Answers questions about North Carolina Medicaid policy from a verified corpus, and releases an answer only after a verifier has passed its exact text.

## Language

### Verification

**Model family**:
The vendor lineage of a model. Two models are the same family when the same vendor trained them, so the verifier is cross-family only when its vendor differs from the agent's.
_Avoid_: cross-provider, cross-vendor

**Withheld**:
A verification verdict against release: the answer is not shown.
_Avoid_: blocked, rejected

**Unavailable**:
A verification run that reached no verdict because the call failed or hit the deadline. Not a withhold, though in production the person sees no answer either way.
_Avoid_: timed out, errored

### Routing

"Routing" alone is ambiguous here; name which of these is meant.

**Question type**:
The one label a question is given out of coverage, prior authorization, amendment, federal authority, policy variant and general. It decides what kind of evidence the answer is built from.
_Avoid_: question family, family hint, intent

**Query flag**:
A yes/no property of a question that adjusts which sections are preferred within its question type, such as asking about billing workflow or telehealth.
_Avoid_: intent flag, signal

**Policy-family routing**:
The choice of which group of related policy documents an answer draws on.
_Avoid_: document routing, family hint

**Coverage scope**:
The reading of a question that decides whether the corpus can answer it at all, and which sources an answer must cite if it can.
_Avoid_: scope gate (that is the on-topic check)
