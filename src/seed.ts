import { close, resetAndSeed } from './graph.ts'

await resetAndSeed()
await close()
console.log('seeded held_a and held_b')
