import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => cleanup())

class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
// xyflow and Radix both measure elements.
;(globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO
