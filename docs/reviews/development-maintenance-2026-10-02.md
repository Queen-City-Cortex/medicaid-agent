# Testing and styling maintenance

Replaces stale PRs #95–#97 against secured current main. Vitest and coverage-v8 are aligned to 4.1.10 across every owning workspace, including contracts. Web jest-dom 7.0.0 has its DOM 10.4.2 peer explicitly declared, supported by the project's Node 22 runtime. Tailwind core and its PostCSS plugin both use 4.3.3.

Exact versions keep this review limited to the original updates; future compatible updates remain managed by Dependabot. Required checks include JS tests/coverage, web production build, test typechecks, mocked browser and production Docker gates.
