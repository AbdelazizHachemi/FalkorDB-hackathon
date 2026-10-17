import {
  close,
  countNodes,
  holdIds,
  holdInvalidAt,
  LABEL_SENTENCE,
  POLICY_TEXT,
  proposeOrder,
  recordFinding,
  resetAndSeed,
} from './graph.ts'

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) {
    console.error(`FAIL ${message}`)
    process.exit(1)
  }
  console.log(`ok ${message}`)
}

await resetAndSeed()
assert(true, 'seeded held_a and held_b')

const first = await proposeOrder('held_a', 'check-allow', 'ibuprofen')
assert(first.decision === 'allowed', 'propose before the hold is allowed')

const recorded = await recordFinding('held_a', 'kidney_impairment')
assert(recorded.holdId, 'kidney finding writes a hold')
assert((await holdInvalidAt('held_a', recorded.holdId)) === null, 'hold invalid_at is null')

const ordersBeforeBlock = await countNodes('held_a', 'Order')
const blocked = await proposeOrder('held_a', 'check-block', 'ibuprofen')
assert(blocked.decision === 'blocked', 'propose after the hold is blocked')
assert(
  blocked.rows.some(
    (row) => row.prescriber === 'Mina Cole' && row.policy === POLICY_TEXT && row.label === LABEL_SENTENCE,
  ),
  'block rows include Mina Cole, the policy, and the label sentence',
)
assert((await countNodes('held_a', 'Order')) === ordersBeforeBlock, 'blocked propose creates no order')

const ordersBeforeParallel = await countNodes('held_a', 'Order')
const attemptsBeforeParallel = await countNodes('held_a', 'Attempt')
const [left, right] = await Promise.all([
  proposeOrder('held_a', 'check-parallel-1', 'ibuprofen'),
  proposeOrder('held_a', 'check-parallel-2', 'ibuprofen'),
])
assert(left.decision === 'blocked' && right.decision === 'blocked', 'parallel proposes are both blocked')
assert((await countNodes('held_a', 'Attempt')) === attemptsBeforeParallel + 2, 'parallel proposes each write an attempt')
assert((await countNodes('held_a', 'Order')) === ordersBeforeParallel, 'parallel proposes create no order')

const other = await proposeOrder('held_b', 'check-b', 'ibuprofen')
assert(other.decision === 'allowed', 'patient B allows ibuprofen')
assert((await holdIds('held_b')).length === 0, 'held_b has no hold')

await close()
console.log('check passed')
