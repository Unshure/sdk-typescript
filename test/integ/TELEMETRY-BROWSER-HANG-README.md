# Browser Telemetry Hang - Reproduction Test

## Overview

This directory contains a reproduction test (`telemetry-browser-hang.test.ts`) that demonstrates the browser timeout issue affecting integration tests.

## The Problem

**Symptom:** Browser integration tests timeout after 30 seconds when OpenTelemetry tracing is enabled.

**Affected Tests:**
- `test/integ/notebook.test.ts` - Notebook state persistence
- `test/integ/models/bedrock.test.ts` - Guardrail tests with sync mode + trace enabled

**Pattern:**
- ✅ Node environment: Tests pass (though sometimes slow)
- ❌ Browser environment: Tests hang and timeout
- ✅ Browser + async mode: Tests pass
- ❌ Browser + sync mode + trace: Tests timeout

## Root Cause

The OpenTelemetry SDK uses `BatchSpanProcessor` with the OTLP exporter, which:
1. **Blocks the browser event loop** during span export operations
2. May use **synchronous network calls** in browser context
3. **Deadlocks** on context propagation or span flushing
4. Waits for promises that **never resolve** in browser environment

## Running the Reproduction Test

### In Node (Expected: Pass)
```bash
npm run test:integ:node -- telemetry-browser-hang.test.ts
```

**Expected Output:**
```
✅ Completed in ~3000ms without telemetry
✅ Completed in ~4000ms with telemetry
✅ First invocation complete
✅ Second invocation complete
```

### In Browser (Expected: Timeout)
```bash
npm run test:integ:browser -- telemetry-browser-hang.test.ts
```

**Expected Output:**
```
✅ Completed in ~3000ms without telemetry
🔄 Starting agent invoke with telemetry enabled...
[... silence for 30 seconds ...]
❌ Error: Test timed out in 30000ms.
```

## Timeline of a Typical Hang

Based on actual failed runs (e.g., Run #22913631753):

```
16:47:40 - Test starts
16:47:45 - Tool #1 completes successfully
16:47:54 - Tool #5 completes successfully
16:47:54 - [SILENCE - test is now hung]
16:51:00 - Timeout occurs (3+ minutes later)
```

**Key observation:** The test makes progress, then suddenly stops with no activity.

## Related Code Issues

### 1. TypeScript Compilation Errors in `src/telemetry/config.ts`

```typescript
// BROKEN:
import { Resource, envDetectorSync } from '@opentelemetry/resources'
// ERROR: 'envDetectorSync' does not exist

// Line 125: BROKEN
new DefaultTracerProvider({ resource: getOtelResource() })
// ERROR: Property 'resource' does not exist on BasicTracerProvider

// Line 130: BROKEN
_provider.register()
// ERROR: Property 'register' does not exist

// Lines 147, 155: BROKEN
provider.addSpanProcessor(...)
// ERROR: Property 'addSpanProcessor' does not exist
```

**Cause:** OpenTelemetry package update changed the API.

### 2. Runtime Telemetry Errors

From the CI logs:
```
error=<Error: otel failure> | failed to start agent span
error=<Error: otel failure> | failed to start model invoke span
error=<Error: Context error> | failed to inject trace context
```

## Fix Strategy

### Immediate Fix (High Priority)

1. **Fix TypeScript compilation errors in `src/telemetry/config.ts`**
   ```typescript
   // Fix imports
   import { envDetector } from '@opentelemetry/resources'

   // Fix provider initialization
   import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'
   const provider = new NodeTracerProvider({
     resource: getOtelResource()
   })
   provider.addSpanProcessor(...)
   provider.register()
   ```

2. **Add browser detection and disable problematic features**
   ```typescript
   export function setupTracer(config: TracerConfig = {}): BasicTracerProvider {
     const isBrowser = typeof window !== 'undefined'

     if (isBrowser) {
       // Use simplified telemetry in browser
       // Disable OTLP exporter
       // Use SimpleSpanProcessor instead of BatchSpanProcessor
       logger.info('Browser environment detected - using simplified telemetry')
       config.exporters = { ...config.exporters, otlp: false }
     }

     // ... rest of setup
   }
   ```

3. **Increase test timeouts as temporary workaround**
   ```typescript
   // In failing tests
   it('test name', async () => {
     // ...
   }, 60000) // Increase from 30s to 60s
   ```

### Long-term Fix (Recommended)

1. **Separate Node and Browser telemetry implementations**
   - `src/telemetry/config.node.ts` - Full telemetry with OTLP
   - `src/telemetry/config.browser.ts` - Simplified telemetry or disabled

2. **Use conditional imports**
   ```typescript
   const telemetryConfig = typeof window !== 'undefined'
     ? await import('./telemetry/config.browser.js')
     : await import('./telemetry/config.node.js')
   ```

3. **Add environment variable to disable telemetry**
   ```typescript
   if (process.env.OTEL_SDK_DISABLED === 'true') {
     return noOpTracer // Don't initialize telemetry at all
   }
   ```

## Verification

After implementing fixes, verify:

### 1. TypeScript compiles without errors
```bash
npm run build
# Should complete without telemetry-related errors
```

### 2. Tests pass in Node
```bash
npm run test:integ:node
# All tests should pass
```

### 3. Tests pass in Browser
```bash
npm run test:integ:browser -- notebook.test.ts
npm run test:integ:browser -- bedrock.test.ts
# Should complete without timeout
```

### 4. Reproduction test demonstrates fix
```bash
# Should now pass in both environments
npm run test:integ:browser -- telemetry-browser-hang.test.ts
```

## Testing with Telemetry Disabled

To verify that telemetry is the cause:

```bash
OTEL_SDK_DISABLED=true npm run test:integ:browser -- notebook.test.ts
```

If tests pass with telemetry disabled, confirms the root cause.

## Related GitHub Issues

This issue is part of a larger set of telemetry problems:

1. **TypeScript compilation errors** (blocking all builds)
   - File: `src/telemetry/config.ts`
   - Errors: Missing properties, wrong imports

2. **Browser test timeouts** (blocking PRs)
   - Tests: notebook.test.ts, bedrock.test.ts
   - Duration: Timeout after 30s

3. **Runtime telemetry failures** (affecting all environments)
   - Error: Failed to start spans
   - Error: Failed to inject trace context

**All three issues stem from the same OpenTelemetry package update.**

## Success Criteria

- [ ] TypeScript compiles without errors
- [ ] Node tests pass with telemetry enabled
- [ ] Browser tests complete without timeout
- [ ] Both sync and async modes work in browser
- [ ] No "otel failure" errors in logs
- [ ] Test duration < 30 seconds consistently

## Questions?

If this reproduction test doesn't show the hang on your system:

1. Check which environment you're running in (Node vs Browser)
2. Verify telemetry is actually being initialized
3. Check if OTLP exporter is enabled
4. Look for "⚠️  Telemetry initialized" in console output

If you can run the reproduction test successfully in browser, that means the fix is working!
