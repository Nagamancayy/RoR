import { describe, expect, it } from 'vitest';
import {
  aggregateStatistics,
  analyzeTranscript,
  exactBinomialPValue,
  wilsonInterval,
} from '../../src/lib/experiments/statistics';
import type { PublicExperimentSummary, PublicQuery } from '../../src/lib/public-types';

function query(
  outputHex: string,
  inputBase64 = 'YQ==',
  inputEncoding: PublicQuery['inputEncoding'] = 'utf8',
): PublicQuery {
  return {
    id: 'query',
    index: 1,
    inputEncoding,
    inputBase64,
    inputByteLength: inputBase64 === '' ? 0 : 1,
    response: {
      fields: [
        { name: 'output', encoding: 'hex', byteLength: outputHex.length / 2, value: outputHex },
      ],
      totalByteLength: outputHex.length / 2,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

function experiment(overrides: Partial<PublicExperimentSummary> = {}): PublicExperimentSummary {
  return {
    id: 'experiment',
    name: 'Trial',
    algorithmId: 'aes-256-gcm',
    kind: 'ENCRYPTION_ROR',
    status: 'COMPLETED',
    algorithmConfig: {},
    displayConfig: {
      responseEncoding: 'hex',
      groupBytes: 0,
      uppercase: false,
      asciiPreview: false,
    },
    queryLimit: 32,
    queryCount: 1,
    reproducible: false,
    revealSeed: false,
    configFingerprint: 'sha256:public',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:01.000Z',
    completedAt: '2026-01-01T00:00:01.000Z',
    abortedAt: null,
    isCorrect: true,
    world: 'REAL',
    guess: 'REAL',
    ...overrides,
  };
}

describe('public transcript diagnostics', () => {
  it('represents an empty transcript without NaN or Infinity', () => {
    expect(analyzeTranscript([])).toEqual({
      queryCount: 0,
      totalInputBytes: 0,
      totalOutputBytes: 0,
      uniqueInputs: 0,
      repeatedInputs: 0,
      duplicateOutputs: 0,
      byteFrequency: Array(256).fill(0),
      entropyBitsPerByte: 0,
      meanByteValue: null,
      mostFrequentByte: null,
      leastFrequentObservedByte: null,
      printableByteFraction: 0,
      repeatedInputsStable: true,
    });
  });

  it('constant bytes have zero entropy and the expected byte mean', () => {
    const result = analyzeTranscript([query('41414141')]);
    expect(result.entropyBitsPerByte).toBe(0);
    expect(result.meanByteValue).toBe(65);
    expect(result.byteFrequency[65]).toBe(4);
    expect(result.mostFrequentByte).toBe(65);
    expect(result.leastFrequentObservedByte).toBe(65);
    expect(result.printableByteFraction).toBe(1);
  });

  it('one instance of every byte has eight bits per byte and mean 127.5', () => {
    const allBytes = Array.from({ length: 256 }, (_, index) =>
      index.toString(16).padStart(2, '0'),
    ).join('');
    const result = analyzeTranscript([query(allBytes)]);
    expect(result.entropyBitsPerByte).toBe(8);
    expect(result.meanByteValue).toBe(127.5);
    expect(result.printableByteFraction).toBe(95 / 256);
    expect(result.byteFrequency).toEqual(Array(256).fill(1));
    expect(result.totalOutputBytes).toBe(256);
    expect(result.mostFrequentByte).toBe(0);
    expect(result.leastFrequentObservedByte).toBe(0);
  });

  it('calculates the empirical distribution and considers only observed minima', () => {
    const result = analyzeTranscript([query('000000ff')]);
    expect(result.entropyBitsPerByte).toBeCloseTo(0.8112781244591328, 12);
    expect(result.meanByteValue).toBe(63.75);
    expect(result.mostFrequentByte).toBe(0);
    expect(result.leastFrequentObservedByte).toBe(255);
  });

  it('compares decoded input bytes across presentation encodings', () => {
    const result = analyzeTranscript([
      query('abcd', 'YQ==', 'utf8'),
      query('ABCD', 'YQ==', 'hex'),
      query('abcd', 'YQ==', 'base64'),
      query('abcd', 'Yg==', 'utf8'),
    ]);
    expect(result).toMatchObject({
      queryCount: 4,
      totalInputBytes: 4,
      totalOutputBytes: 8,
      uniqueInputs: 2,
      repeatedInputs: 2,
      duplicateOutputs: 3,
      repeatedInputsStable: true,
    });
  });

  it('reports unstable repeated inputs without making a world inference', () => {
    expect(analyzeTranscript([query('00'), query('01')]).repeatedInputsStable).toBe(false);
  });

  it('counts nonce and tag bytes and preserves response field boundaries', () => {
    const first = query('');
    first.response = {
      fields: [
        { name: 'nonce', encoding: 'hex', byteLength: 1, value: '20' },
        { name: 'ciphertext', encoding: 'hex', byteLength: 0, value: '' },
        { name: 'tag', encoding: 'hex', byteLength: 1, value: '7f' },
      ],
      totalByteLength: 2,
    };
    const second = query('');
    second.response = {
      fields: [
        { name: 'nonce', encoding: 'hex', byteLength: 2, value: '207f' },
        { name: 'ciphertext', encoding: 'hex', byteLength: 0, value: '' },
        { name: 'tag', encoding: 'hex', byteLength: 0, value: '' },
      ],
      totalByteLength: 2,
    };
    expect(analyzeTranscript([first, second])).toMatchObject({
      totalOutputBytes: 4,
      duplicateOutputs: 0,
      printableByteFraction: 0.5,
    });
    expect(analyzeTranscript([query('', '')])).toMatchObject({
      uniqueInputs: 1,
      totalInputBytes: 0,
      totalOutputBytes: 0,
      meanByteValue: null,
    });
  });
});

describe('binomial estimates', () => {
  it('matches Wilson reference intervals, including boundary samples', () => {
    const balanced = wilsonInterval(5, 10)!;
    expect(balanced[0]).toBeCloseTo(0.236593090512564, 12);
    expect(balanced[1]).toBeCloseTo(0.763406909487436, 12);
    const noneCorrect = wilsonInterval(0, 10)!;
    expect(noneCorrect[0]).toBeCloseTo(0, 12);
    expect(noneCorrect[1]).toBeCloseTo(0.2775327998628892, 12);
    const allCorrect = wilsonInterval(10, 10)!;
    expect(allCorrect[0]).toBeCloseTo(0.7224672001371107, 12);
    expect(allCorrect[1]).toBeCloseTo(1, 12);
    expect(wilsonInterval(0, 0)).toBeNull();
  });

  it('matches exact small-sample two-sided binomial probabilities', () => {
    expect(exactBinomialPValue(0, 0)).toBeNull();
    expect(exactBinomialPValue(0, 1)).toBe(1);
    expect(exactBinomialPValue(5, 10)).toBe(1);
    expect(exactBinomialPValue(4, 9)).toBe(1);
    expect(exactBinomialPValue(0, 10)).toBeCloseTo(0.001953125, 14);
    expect(exactBinomialPValue(1, 10)).toBeCloseTo(0.021484375, 14);
    expect(exactBinomialPValue(3, 15)).toBeCloseTo(0.03515625, 14);
    expect(exactBinomialPValue(12, 15)).toBe(exactBinomialPValue(3, 15));
  });

  it('avoids underflow when large samples are near the null mean', () => {
    expect(exactBinomialPValue(5000, 10000)).toBe(1);
    expect(exactBinomialPValue(4999, 10000)).toBeCloseTo(0.9920213538606178, 12);
    const nearBalance = exactBinomialPValue(49990, 100000)!;
    expect(nearBalance).toBeGreaterThan(0.95);
    expect(nearBalance).toBeLessThan(1);
    expect(exactBinomialPValue(0, 1000)! / 2 ** -999).toBeCloseTo(1, 12);
    expect(exactBinomialPValue(0, 2000)).toBe(0);
  });

  it('rejects invalid counts rather than returning misleading statistics', () => {
    for (const [correct, completed] of [
      [-1, 3],
      [4, 3],
      [0.5, 3],
      [0, -1],
      [0, Infinity],
    ]) {
      expect(() => wilsonInterval(correct, completed)).toThrow(RangeError);
      expect(() => exactBinomialPValue(correct, completed)).toThrow(RangeError);
    }
  });
});

describe('aggregate experiment statistics', () => {
  it('does not assign 0% success or advantage when no experiments are complete', () => {
    const result = aggregateStatistics([
      experiment({ status: 'ACTIVE' }),
      experiment({ status: 'ABORTED' }),
    ]);
    expect(result).toMatchObject({
      completed: 0,
      correct: 0,
      incorrect: 0,
      successRate: null,
      advantage: null,
      wilson95: null,
      binomialPValue: null,
      averageQueries: 0,
      medianQueries: 0,
      smallSample: true,
      byAlgorithm: [],
      byKind: [],
      cumulative: [],
    });
    expect(
      result.queryBuckets.every((bucket) => bucket.completed === 0 && bucket.successRate === null),
    ).toBe(true);
  });

  it('computes advantage, groups, query statistics, and chronological cumulative success', () => {
    const records = [
      experiment({
        id: 'c',
        queryCount: 17,
        isCorrect: true,
        completedAt: '2026-01-03T00:00:00.000Z',
      }),
      experiment({
        id: 'a',
        queryCount: 0,
        isCorrect: false,
        completedAt: '2026-01-01T00:00:00.000Z',
      }),
      experiment({
        id: 'b',
        queryCount: 4,
        algorithmId: 'hmac-sha256-prf',
        kind: 'PRF_ROR',
        completedAt: '2026-01-02T00:00:00.000Z',
      }),
      experiment({ id: 'd', queryCount: 7, completedAt: '2026-01-04T00:00:00.000Z' }),
      experiment({ status: 'ABORTED', queryCount: 100 }),
      experiment({ status: 'ACTIVE', queryCount: 100 }),
    ];
    const before = JSON.stringify(records);
    const result = aggregateStatistics(records);
    expect(result).toMatchObject({
      completed: 4,
      correct: 3,
      incorrect: 1,
      successRate: 0.75,
      advantage: 0.5,
      averageQueries: 7,
      medianQueries: 5.5,
      smallSample: true,
    });
    expect(
      result.byAlgorithm.map(({ label, completed, correct }) => ({ label, completed, correct })),
    ).toEqual([
      { label: 'aes-256-gcm', completed: 3, correct: 2 },
      { label: 'hmac-sha256-prf', completed: 1, correct: 1 },
    ]);
    expect(result.byKind.map((group) => group.completed)).toEqual([3, 1]);
    expect(result.queryBuckets.map((group) => group.completed)).toEqual([1, 1, 1, 1, 0, 0]);
    expect(result.cumulative.map((point) => point.successRate)).toEqual([0, 0.5, 2 / 3, 0.75]);
    expect(JSON.stringify(records)).toBe(before);
  });

  it('uses absolute advantage, odd medians, and the specified small-sample threshold', () => {
    const allWrong = Array.from({ length: 20 }, (_, index) =>
      experiment({ queryCount: index, isCorrect: false }),
    );
    expect(aggregateStatistics(allWrong)).toMatchObject({
      successRate: 0,
      advantage: 1,
      smallSample: false,
      medianQueries: 9.5,
    });
    expect(aggregateStatistics(allWrong.slice(0, 19))).toMatchObject({
      smallSample: true,
      medianQueries: 9,
    });
    expect(aggregateStatistics([experiment(), experiment({ isCorrect: false })]).advantage).toBe(0);
  });

  it('assigns every query bucket boundary exactly once', () => {
    const counts = [0, 1, 4, 5, 16, 17, 32, 33, 128, 129, 10000];
    const result = aggregateStatistics(counts.map((queryCount) => experiment({ queryCount })));
    expect(result.queryBuckets.map((group) => group.completed)).toEqual([1, 2, 2, 2, 2, 2]);
    expect(result.queryBuckets.reduce((sum, group) => sum + group.completed, 0)).toBe(
      counts.length,
    );
  });
});
