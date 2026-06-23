// `@testing-library/jest-dom/vitest` is imported for its TYPE augmentation only
// (`declare module 'vitest'` adds toBeInTheDocument/toHaveAttribute/etc. to
// Assertion). Under Vitest 4 its auto-register side effect no longer attaches
// the matchers at runtime ("Invalid Chai property"), so we also extend the
// imported `expect` explicitly with the standalone matchers — the supported,
// instance-safe pattern that fixes runtime registration.
import '@testing-library/jest-dom/vitest';
import * as matchers from '@testing-library/jest-dom/matchers';
import { cleanup } from '@testing-library/react';
import { afterEach, expect } from 'vitest';

expect.extend(matchers);

afterEach(() => {
  cleanup();
});
