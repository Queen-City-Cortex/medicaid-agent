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
