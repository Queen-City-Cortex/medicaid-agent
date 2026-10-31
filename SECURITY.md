# Security policy

## Reporting a vulnerability

Report vulnerabilities privately through [GitHub private vulnerability reporting](https://github.com/Queen-City-Cortex/medicaid-agent/security/advisories/new). If you cannot use GitHub, email legal@queencitycortex.com with "security" in the subject. Please do not open a public issue.

Include what you found, how to reproduce it, and what an attacker could do with it. You should get an acknowledgement within seven days. This is a one-person project with no users, so there is no bounty and no service-level commitment, but reports are read and fixed.

## What is in scope

The code in this repository, in particular:

- anything that lets model-written text reach a client without passing the verifier (see the answer-release rules in [AGENTS.md](AGENTS.md));
- anything that lets one signed-in user read or change another user's conversations, research runs or feedback;
- credentials or personal data committed to the repository or its history.

The project's own hosted deployment is not a target for testing. Do not send automated traffic to it.

## Supported versions

Only the `main` branch is maintained.
