# Setup Guide: Debug Browser Hang Workflow

## Prerequisites

- Access to Unshure organization fork of sdk-typescript
- AWS credentials configured in repository secrets
- GitHub Actions enabled

## Step 1: Add Unshure Fork as Remote

```bash
cd /Users/ncclegg/sdk-typescript

# Add Unshure fork as remote
git remote add unshure https://github.com/Unshure/sdk-typescript.git

# Verify
git remote -v
```

## Step 2: Create Debug Branch

```bash
# Make sure we're on guardrail-bedrock branch (has latest changes)
git checkout guardrail-bedrock

# Create new branch for testing
git checkout -b test/browser-hang-debug

# Verify the workflow file exists
ls -la .github/workflows/debug-browser-hang.yml
```

## Step 3: Push to Unshure Fork

```bash
# Push to Unshure fork
git push unshure test/browser-hang-debug

# Or if you want to test multiple scenarios, create separate branches:
git checkout -b debug/notebook-test
git push unshure debug/notebook-test

git checkout -b debug/bedrock-test
git push unshure debug/bedrock-test
```

## Step 4: Configure GitHub Secrets (If Not Already Set)

In the Unshure fork repository settings, ensure these secrets are configured:

1. **AWS_ROLE_ARN** - AWS IAM role for accessing Bedrock/other AWS services
2. API keys for model providers (Anthropic, OpenAI, etc.)

These may already be configured if the fork runs integration tests.

## Step 5: Run the Workflow

### Option A: Manual Trigger (Recommended for First Run)

1. Go to: https://github.com/Unshure/sdk-typescript/actions
2. Click on "Debug Browser Hang" workflow
3. Click "Run workflow" button
4. Configure parameters:
   ```
   Branch: test/browser-hang-debug
   Test file: telemetry-browser-hang.test.ts
   Iterations: 10
   Timeout: 60
   Disable telemetry: false
   ```
5. Click "Run workflow"

### Option B: Automatic Trigger

Just push to a `debug/*` or `test/browser-hang` branch:

```bash
git checkout -b debug/test-run-1
git push unshure debug/test-run-1
```

The workflow will run automatically with default parameters.

## Step 6: Monitor the Run

1. Go to Actions tab in Unshure fork
2. Click on the running workflow
3. Watch the 5 parallel jobs (one per iteration)
4. Check the summary at the end for statistics

## Step 7: Review Results

### Check the Summary

At the end of the workflow run, check the summary page for:
- Number of timeouts detected
- Success rate
- Links to artifacts

### Download Artifacts

If any timeouts occurred:
1. Scroll to bottom of workflow page
2. Download artifacts:
   - `test-logs-iteration-X` - Individual iteration logs
   - `test-summary` - Combined analysis

### Analyze Logs

```bash
# Extract downloaded artifacts
unzip test-logs-iteration-1.zip

# Check for timeouts
grep "Test timed out" test-output-1.log

# Check for OpenTelemetry errors
grep "otel failure" test-output-1.log

# Check last 100 lines before timeout
tail -100 test-output-1.log
```

## Quick Testing Scenarios

### Scenario 1: Prove We Can Reproduce (Run First!)

```yaml
Test file: telemetry-browser-hang.test.ts
Iterations: 10
Timeout: 60
Disable telemetry: false
```

**Expected**: Baseline - may or may not see timeouts

---

### Scenario 2: Test Original Failing Test

```yaml
Test file: notebook.test.ts
Iterations: 20
Timeout: 30
Disable telemetry: false
```

**Expected**: If we can reproduce, should see 1-3 timeouts

---

### Scenario 3: Isolate Telemetry

```yaml
Test file: notebook.test.ts
Iterations: 20
Timeout: 30
Disable telemetry: true  ← KEY CHANGE
```

**Expected**:
- Timeouts disappear → Telemetry is the cause
- Timeouts persist → Not telemetry

---

### Scenario 4: Test With Longer Timeout

```yaml
Test file: notebook.test.ts
Iterations: 10
Timeout: 120  ← 2 minutes
Disable telemetry: false
```

**Expected**:
- Tests pass → Just slow, not hung
- Tests timeout → Actual deadlock

## Troubleshooting

### Workflow Doesn't Appear

- Check that workflow file is in `.github/workflows/` directory
- Ensure branch is pushed to Unshure fork
- Verify Actions are enabled in repository settings

### Workflow Fails Immediately

- Check AWS credentials are configured
- Verify API keys are set up
- Check build succeeds (`npm run build`)

### Can't Reproduce Timeouts

- Increase iterations (try 50+)
- Try different test files
- Check if recent changes fixed the issue
- Compare with original failing CI logs

### Need More Debug Info

Add debugging to test file:

```typescript
it('test name', async () => {
  console.log('STEP 1:', new Date().toISOString())
  // ... operation 1
  console.log('STEP 2:', new Date().toISOString())
  // ... operation 2
  console.log('STEP 3:', new Date().toISOString())
}, 60000)
```

Then push and re-run.

## Expected Outcomes by Scenario

### If Issue is OpenTelemetry:
- ✅ Timeouts with telemetry enabled
- ✅ No timeouts with telemetry disabled
- ✅ Timeouts increase with longer-running tests
- ✅ Pattern matches 5-second BatchSpanProcessor timer

### If Issue is Network/AWS:
- ✅ Timeouts with or without telemetry
- ✅ Specific to Bedrock tests
- ✅ No timeouts with shorter operations
- ✅ Longer timeouts help

### If Issue is Fixed:
- ✅ No timeouts in any scenario
- ✅ All tests complete within expected time
- ✅ Can close investigation

## Next Steps After Results

1. **Document findings** in `BROWSER-HANG-TEST-RESULTS-CI.md`
2. **Update hypothesis** in `ALTERNATIVE-HYPOTHESIS.md`
3. **Implement fix** based on evidence
4. **Re-run workflow** to validate fix (50+ iterations)
5. **Create PR** with fix and test evidence

## Commands Cheat Sheet

```bash
# Setup
cd /Users/ncclegg/sdk-typescript
git remote add unshure https://github.com/Unshure/sdk-typescript.git
git checkout -b test/browser-hang-debug
git push unshure test/browser-hang-debug

# To update after changes
git add .github/workflows/debug-browser-hang.yml
git commit -m "Update debug workflow"
git push unshure test/browser-hang-debug

# Create new test branch
git checkout -b debug/test-iteration-2
git push unshure debug/test-iteration-2

# Check remote branches
git ls-remote --heads unshure
```

## Support

Refer to these documents for context:
- `BROWSER-HANG-TEST-PLAN.md` - Detailed testing plan
- `BROWSER-HANG-INVESTIGATION-SUMMARY.md` - Background investigation
- `WHY-TESTS-ARE-FLAKY.md` - Flakiness analysis
- `test/integ/telemetry-browser-hang.test.ts` - Reproduction test
