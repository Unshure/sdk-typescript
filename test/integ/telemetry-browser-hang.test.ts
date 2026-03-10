/**
 * Minimal reproduction test for browser telemetry timeout issue
 *
 * This test demonstrates the hang that occurs when:
 * - Running in browser environment (chromium)
 * - Using OpenTelemetry with trace enabled
 * - With BatchSpanProcessor (used by OTLP exporter)
 *
 * EXPECTED BEHAVIOR:
 * - Node environment: Both tests pass
 * - Browser environment: Tests timeout after 30s when telemetry is enabled
 *
 * ROOT CAUSE:
 * - BatchSpanProcessor in browser may block event loop during span export
 * - Synchronous operations in telemetry SDK that don't complete in browser
 * - Race condition or deadlock in span flushing logic
 *
 * Related Issues:
 * - Browser tests timing out: test/integ/notebook.test.ts
 * - Browser tests timing out: test/integ/models/bedrock.test.ts (sync mode)
 * - TypeScript errors in src/telemetry/config.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Agent } from '$/sdk/index.js'
import { setupTracer } from '$/sdk/telemetry/index.js'
import { anthropic } from './__fixtures__/model-providers.js'

describe.skipIf(anthropic.skip)('Telemetry Browser Hang Reproduction', () => {
  // Test with telemetry DISABLED first (should pass)
  describe('Without Telemetry (Control)', () => {
    it('should complete quickly in browser without telemetry', async () => {
      const agent = new Agent({
        model: anthropic.createModel(),
        printer: false,
      })

      const startTime = Date.now()
      const result = await agent.invoke('Say "Hello"')
      const duration = Date.now() - startTime

      expect(result.toString()).toBeTruthy()
      expect(duration).toBeLessThan(10000) // Should be fast

      console.log(`✅ Completed in ${duration}ms without telemetry`)
    }, 15000)
  })

  // Test with telemetry ENABLED (reproduces the hang)
  describe('With Telemetry Enabled (Reproduction)', () => {
    let tracerProvider: any

    beforeAll(() => {
      // This is what causes the browser hang
      // The OTLP exporter with BatchSpanProcessor blocks in browser
      try {
        tracerProvider = setupTracer({
          exporters: {
            otlp: true, // This causes blocking in browser!
            console: false,
          },
        })
        console.log('⚠️  Telemetry initialized - expect browser hang')
      } catch (error) {
        console.log('⚠️  Telemetry setup failed:', error)
        // This might fail due to TypeScript compilation errors in config.ts
        // But we still want to document the issue
      }
    })

    afterAll(async () => {
      if (tracerProvider) {
        try {
          // Cleanup - this might also hang in browser
          await tracerProvider.forceFlush()
          await tracerProvider.shutdown()
        } catch (error) {
          console.log('⚠️  Telemetry cleanup failed:', error)
        }
      }
    })

    it('should complete but will likely TIMEOUT in browser', async () => {
      const agent = new Agent({
        model: anthropic.createModel(),
        printer: false,
      })

      const startTime = Date.now()
      console.log('🔄 Starting agent invoke with telemetry enabled...')

      // This will hang in browser environment due to telemetry blocking
      // In Node environment, this should complete normally
      const result = await agent.invoke('Say "Hello"')

      const duration = Date.now() - startTime

      expect(result.toString()).toBeTruthy()
      console.log(`✅ Completed in ${duration}ms with telemetry`)

      // If we get here in browser, it's a success!
      // But typically this test will timeout after 30 seconds
    }, 30000) // 30 second timeout - matches the failing tests

    it('demonstrates the hang with multiple invocations', async () => {
      const agent = new Agent({
        model: anthropic.createModel(),
        printer: false,
      })

      console.log('🔄 First invocation...')
      const result1 = await agent.invoke('What is 1+1?')
      expect(result1.toString()).toBeTruthy()
      console.log('✅ First invocation complete')

      console.log('🔄 Second invocation (this is where notebook test hangs)...')
      // This second invocation is often where the hang occurs
      // Similar to the notebook test that times out after tool #5
      const result2 = await agent.invoke('What is 2+2?')
      expect(result2.toString()).toBeTruthy()
      console.log('✅ Second invocation complete')

      // If both complete, we'll see this message
      // In browser with telemetry, we typically don't get here
    }, 30000)
  })

  describe('Debugging Information', () => {
    it('should detect browser vs node environment', () => {
      const isBrowser = typeof window !== 'undefined'
      const hasProcess = typeof globalThis.process !== 'undefined'
      const hasAsyncHooks = hasProcess && typeof globalThis.process.getBuiltinModule === 'function'

      console.log('Environment Detection:')
      console.log('  - isBrowser:', isBrowser)
      console.log('  - hasProcess:', hasProcess)
      console.log('  - hasAsyncHooks:', hasAsyncHooks)
      console.log('  - userAgent:', typeof navigator !== 'undefined' ? navigator.userAgent : 'N/A')

      // Document what we expect
      if (isBrowser) {
        console.log('⚠️  Running in BROWSER - telemetry tests will likely timeout')
        console.log('   - BatchSpanProcessor may block event loop')
        console.log('   - OTLP exporter may use synchronous network calls')
        console.log('   - Context propagation may deadlock')
      } else {
        console.log('✅ Running in NODE - telemetry should work normally')
      }

      expect(true).toBe(true) // Always pass, just for logging
    })

    it('should show telemetry configuration issues', () => {
      console.log('Known Issues in src/telemetry/config.ts:')
      console.log('  1. envDetectorSync does not exist (should be envDetector)')
      console.log('  2. BasicTracerProvider missing resource, register, addSpanProcessor')
      console.log('  3. Need browser-specific telemetry initialization')
      console.log('')
      console.log('Recommended Fix:')
      console.log('  - Add browser detection: if (typeof window !== "undefined")')
      console.log('  - Disable OTLP exporter in browser')
      console.log('  - Use SimpleSpanProcessor instead of BatchSpanProcessor')
      console.log('  - Or completely disable telemetry in browser')

      expect(true).toBe(true) // Always pass, just for logging
    })
  })
})

/**
 * How to run this test:
 *
 * Node environment (should pass):
 *   npm run test:integ:node -- telemetry-browser-hang.test.ts
 *
 * Browser environment (will timeout):
 *   npm run test:integ:browser -- telemetry-browser-hang.test.ts
 *
 * Expected Results:
 * - Node: All tests pass, telemetry works normally
 * - Browser: Tests without telemetry pass, tests with telemetry timeout
 *
 * This demonstrates the exact issue seen in:
 * - test/integ/notebook.test.ts (times out after tool completion)
 * - test/integ/models/bedrock.test.ts (sync mode times out)
 */
