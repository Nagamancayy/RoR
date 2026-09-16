import { randomInt } from 'node:crypto';
import type { Adversary } from './contracts';
export class RandomBaseline implements Adversary {
  constructor(private readonly bit: () => number = () => randomInt(2)) {}
  async run() {
    return {
      action: {
        action: 'submit_guess' as const,
        world: this.bit() === 0 ? ('REAL' as const) : ('RANDOM' as const),
        confidence: 0.5,
        explanation: 'Independent random guess; no oracle queries.',
      },
      usage: { input: 0, output: 0, total: 0, complete: true },
      model: null,
    };
  }
}
