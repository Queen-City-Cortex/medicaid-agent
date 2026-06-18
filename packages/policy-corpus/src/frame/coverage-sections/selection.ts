// Coverage rebalance selection: takes the sections surfaced by the coverage
// pipeline and re-derives the primary/supporting/avoid split. The stages run
// in order and are all exported because frame/rebalance/coverage.ts (and the
// coverage tests) drive them individually:
//
//   1. scoreCoverageSections      — per-section primary/support scores       (selection/scoring.ts)
//   2. collectCoverageSectionGroups — flag-driven section groupings          (selection/groups.ts)
//   3. buildCoverageInitialSelection — score-ranked initial primary/support pick (selection/initial-selection.ts)
//   4. buildCoverageAnchors       — flag-specific anchor sections that must lead  (selection/anchors.ts)
//   5. assembleCoverageSections   — final primary/supporting/avoid assembly  (selection/assembly.ts)
//
// Everything not needed to drive those stages is private to each stage module.
// This barrel preserves the original import path so consumers
// (frame/rebalance/coverage.ts and the coverage tests) need no changes.
export * from './selection/scoring.js';
export * from './selection/groups.js';
export * from './selection/initial-selection.js';
export * from './selection/anchors.js';
export * from './selection/assembly.js';
