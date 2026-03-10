# Browser Hang Testing Plan

## Objective

Reproduce and identify the root cause of flaky browser test timeouts in CI/CD environment.

## Current Status

- **3/100 CI runs** had browser timeouts in the last 2 weeks
- **Local runs** pass consistently
- **Hypothesis**: Race condition with OpenTelemetry, network latency, or Bedrock operations

## Test Setup

### New Workflow: `debug-browser-hang.yml`

A focused debugging workflow that:
- ✅ Runs specific test files multiple times
- ✅ Configurable timeout values
- ✅ Can disable/enable OpenTelemetry
- ✅ Captures detailed logs and artifacts
- ✅ Generates summary statistics
- ✅ Can be manually triggered with different parameters

### How to Use

#### Method 1: Manual Trigger (Recommended)

1. Go to Actions → "Debug Browser Hang"
2. Click "Run workflow"
3. Configure parameters:
   - **Test file**: Choose which test to run
   - **Iterations**: How many times to run (default: 5)
   - **Timeout**: Test timeout in seconds (default: 60)
   - **Disable telemetry**: Test with/without OpenTelemetry

#### Method 2: Push to Branch

Push to branches named:
- `debug/*` (e.g., `debug/test-notebook`)
- `test/browser-hang`

This will automatically run with default settings.

## Testing Scenarios

### Phase 1: Baseline Testing (Prove We Can Reproduce)

**Goal**: Catch at least one timeout to confirm we can reproduce the issue.

**Test 1: High Iteration Count**
```yaml
test-file: notebook.test.ts
iterations: 20
timeout: 30
disable-telemetry: false
```

**Expected**: If issue exists, should see 1-3 timeouts (5-15% failure rate)

---

**Test 2: Bedrock Guardrail Tests**
```yaml
test-file: models/bedrock.test.ts
iterations: 20
timeout: 60
disable-telemetry: false
```

**Expected**: If guardrail-specific, should see timeouts here

---

**Test 3: Our Reproduction Test**
```yaml
test-file: telemetry-browser-hang.test.ts
iterations: 10
timeout: 30
disable-telemetry: false
```

**Expected**: Should help isolate telemetry vs other factors

### Phase 2: Isolation Testing (Identify Root Cause)

**Test 4: Telemetry Disabled**
```yaml
test-file: notebook.test.ts
iterations: 20
timeout: 30
disable-telemetry: true  ← Changed
```

**Expected**:
- If timeouts disappear → OpenTelemetry is the cause
- If timeouts persist → Not OpenTelemetry, look at network/AWS

---

**Test 5: Extended Timeout**
```yaml
test-file: notebook.test.ts
iterations: 10
timeout: 120  ← Changed to 2 minutes
disable-telemetry: false
```

**Expected**:
- If tests pass → Just slow operations, increase timeout
- If tests still timeout → Actual hang/deadlock

---

**Test 6: Side-by-Side Comparison**

Run two tests in parallel:
- One with telemetry enabled
- One with telemetry disabled

Compare timeout rates directly.

### Phase 3: Deep Debugging (Understand Mechanism)

Once we can reproduce the timeout:

1. **Add detailed logging** to the test file
2. **Instrument telemetry code** to log export attempts
3. **Add timestamps** at each step to find exact hang point
4. **Monitor browser console** for errors
5. **Check network tab** for stuck requests

## Success Criteria

### Proof of Reproduction
- ✅ At least 1 timeout in 20 runs of a specific test
- ✅ Timeout is reproducible across multiple workflow runs
- ✅ Can capture logs showing where test hangs

### Root Cause Identification
- ✅ Understand if telemetry, network, or other factor
- ✅ Can reliably reproduce with specific conditions
- ✅ Have detailed logs showing failure mechanism

### Fix Validation
- ✅ After applying fix, 0 timeouts in 50+ runs
- ✅ Tests complete within expected time range
- ✅ No degradation in other tests

## Workflow Outputs

### Artifacts Generated

For each iteration:
- `test-output-{N}.log` - Complete test output
- `test/.artifacts/` - Vitest artifacts including:
  - Browser screenshots (if test fails)
  - Test reports (JSON, JUnit)
  - Coverage reports

### Summary Report

Generated in GitHub Actions summary:
- Success/Failure count per iteration
- Timeout detection
- OpenTelemetry error detection
- Overall statistics

### Example Summary:
```
Debug Browser Hang Test Summary

Test Configuration
- Test File: notebook.test.ts
- Iterations: 20
- Timeout: 30s
- Telemetry Disabled: false

Results by Iteration
- Iteration 1: ✅ PASSED
- Iteration 2: ✅ PASSED
- Iteration 3: ❌ TIMEOUT
- Iteration 4: ✅ PASSED
...

Summary Statistics
- Total Runs: 20
- Successes: 17
- Timeouts: 3
- Other Failures: 0
- Timeout Rate: 15%
```

## Expected Timeline

### Week 1: Reproduction
- Day 1-2: Run baseline tests (20+ iterations each)
- Day 3-4: Analyze results, identify patterns
- Day 5: Confirm we can reproduce the issue

### Week 2: Isolation
- Day 1-2: Run tests with telemetry disabled
- Day 3-4: Run tests with extended timeouts
- Day 5: Determine if OpenTelemetry is primary cause

### Week 3: Fix & Validate
- Day 1-2: Implement fix based on findings
- Day 3-5: Run 50+ iterations to validate fix

## Alternative Scenarios

### Scenario A: Issue Doesn't Reproduce

**What it means**:
- Recent changes may have fixed it
- Issue is more rare than 3% (need 100+ iterations)
- Issue is specific to original CI environment

**Next steps**:
1. Try longer-running tests
2. Add artificial delays to trigger export timer
3. Review differences between current and failing CI environments

### Scenario B: Issue Reproduces Without Telemetry

**What it means**:
- Not an OpenTelemetry issue
- Likely network latency or Bedrock-specific

**Next steps**:
1. Profile network calls
2. Test with OpenAI/Anthropic instead of Bedrock
3. Add network mocking to isolate
4. Check AWS API limits/throttling

### Scenario C: Issue Only Reproduces With Telemetry

**What it means**:
- OpenTelemetry hypothesis confirmed
- BatchSpanProcessor likely culprit

**Next steps**:
1. Add browser detection to disable OTLP
2. Use SimpleSpanProcessor instead of Batch
3. Completely disable telemetry in browser
4. Test fix with 50+ iterations

## Running the Tests

### Quick Start

1. Fork the repo to Unshure organization
2. Ensure AWS credentials are configured in repo secrets
3. Go to Actions tab
4. Run "Debug Browser Hang" workflow
5. Choose parameters based on testing phase
6. Review results in workflow summary

### Recommended First Run

```yaml
test-file: telemetry-browser-hang.test.ts
iterations: 10
timeout: 60
disable-telemetry: false
```

This uses our custom reproduction test with reasonable defaults.

## Next Steps After Testing

Once root cause is identified:

1. **Update `ALTERNATIVE-HYPOTHESIS.md`** with findings
2. **Create fix** based on identified cause
3. **Test fix** with same workflow (50+ iterations)
4. **Update documentation** with learnings
5. **Create PR** with fix and evidence from test runs

## Questions This Will Answer

- ✅ Can we reproduce the timeout in CI?
- ✅ Is it related to OpenTelemetry?
- ✅ What is the actual failure rate?
- ✅ Does disabling telemetry fix it?
- ✅ Do longer timeouts help?
- ✅ Which tests are most affected?
- ✅ Where exactly does the test hang?

## Contact

If you need help running these tests or interpreting results, refer to:
- `BROWSER-HANG-INVESTIGATION-SUMMARY.md` - Complete analysis
- `WHY-TESTS-ARE-FLAKY.md` - Flakiness explanation
- `REPRODUCTION-TEST-RESULTS.md` - Local test results
