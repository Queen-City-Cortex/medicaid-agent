// Single entry point for message-part utilities: re-exports the part guards
// plus the verification, sources, and citations modules. Pure barrel — keeping
// no definitions here means the sub-modules can depend on each other (and on
// the guards) without any import routing back through this file.

export * from './message-part-guards';
export * from './message-verification';
export * from './message-sources';
export * from './message-citations';
