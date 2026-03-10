import { describe, expect, it } from 'vitest'
import { Agent } from '$/sdk/index.js'
import { notebook } from '$/sdk/vended-tools/notebook/index.js'
import { collectGenerator } from '$/sdk/__fixtures__/model-test-helpers.js'
import { bedrock } from './__fixtures__/model-providers.js'

describe.skipIf(bedrock.skip)('Notebook Tool (Minimal)', () => {
  const agentParams = {
    model: bedrock.createModel({
      region: 'us-east-1',
    }),
    tools: [notebook],
  }

  it('should create and use notebook in single operation', async () => {
    const agent = new Agent(agentParams)

    // Single API call that creates and uses notebook
    await collectGenerator(
      agent.stream('Create a notebook called "quick" with content "Test" and then read it back to me')
    )

    // Verify notebook exists in state
    const notebooks = agent.state.get('notebooks') as any
    expect(notebooks).toBeTruthy()
    expect(notebooks.quick).toContain('Test')
  }, 15000) // Shorter timeout for single API call

  it('should restore state', async () => {
    const agent1 = new Agent(agentParams)

    // Create notebook
    await collectGenerator(agent1.stream('Create a notebook called "save" with "Data"'))

    // Save and restore state
    const savedState = agent1.state.getAll()
    const agent2 = new Agent({
      ...agentParams,
      state: savedState,
    })

    // Verify state was restored without another API call
    const notebooks = agent2.state.get('notebooks') as any
    expect(notebooks).toBeTruthy()
    expect(notebooks.save).toContain('Data')
  }, 15000)
})
