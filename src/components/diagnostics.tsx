'use client';

import type { TranscriptAnalysis } from '@/lib/public-types';
import { number, percent } from './common';

export function Diagnostics({
  analysis,
  prf = false,
}: {
  analysis: TranscriptAnalysis;
  prf?: boolean;
}) {
  const maximum = Math.max(1, ...analysis.byteFrequency);
  const byte = (value: number | null) =>
    value == null ? '—' : `0x${value.toString(16).padStart(2, '0')}`;
  const metrics = [
    ['Queries', number(analysis.queryCount)],
    ['Total input', `${number(analysis.totalInputBytes)} B`],
    ['Total output', `${number(analysis.totalOutputBytes)} B`],
    ['Unique inputs', number(analysis.uniqueInputs)],
    ['Repeated inputs', number(analysis.repeatedInputs)],
    ['Duplicate outputs', number(analysis.duplicateOutputs)],
    ['Mean byte value', number(analysis.meanByteValue, 2)],
    ['Most frequent byte', byte(analysis.mostFrequentByte)],
    ['Least frequent observed', byte(analysis.leastFrequentObservedByte)],
    [
      'Printable-byte fraction',
      analysis.totalOutputBytes ? percent(analysis.printableByteFraction) : '—',
    ],
  ];
  return (
    <section className="panel diagnostics">
      <div className="eyebrow">PUBLIC DATA ONLY</div>
      <h2>Transcript diagnostics</h2>
      <div className="diagnostic-lead">
        <div>
          <strong>
            {analysis.totalOutputBytes ? analysis.entropyBitsPerByte.toFixed(3) : '—'}
          </strong>
          <span>Empirical Shannon entropy</span>
        </div>
        <span className="entropy-unit">bits / byte</span>
      </div>
      <div
        className="histogram"
        role="img"
        aria-label={`Frequency distribution of all ${analysis.totalOutputBytes} output bytes, byte values 0 through 255.`}
      >
        {analysis.byteFrequency.map((count, index) => (
          <div
            className="histogram-bar"
            key={index}
            title={`0x${index.toString(16).padStart(2, '0')}: ${count}`}
            style={{ height: `${(count / maximum) * 100}%`, opacity: count ? 1 : 0.15 }}
          />
        ))}
      </div>
      <div className="chart-labels">
        <span>00</span>
        <span>40</span>
        <span>80</span>
        <span>c0</span>
        <span>ff</span>
      </div>
      <p className="chart-caption">
        All public response fields · {number(analysis.totalOutputBytes)} observed bytes · Expected
        uniform count: {(analysis.totalOutputBytes / 256).toFixed(1)} per byte.
      </p>
      {metrics.map(([label, value]) => (
        <div className="diagnostic-row" key={label}>
          <span>{label}</span>
          <span>{value}</span>
        </div>
      ))}
      {prf && (
        <div className="diagnostic-row">
          <span>Repeat consistency</span>
          <span>
            {analysis.repeatedInputs === 0
              ? 'No repeats yet'
              : analysis.repeatedInputsStable
                ? 'Stable'
                : 'Inconsistent'}
          </span>
        </div>
      )}
      <details className="diagnostic-details">
        <summary>Inspect exact byte counts</summary>
        <div className="frequency-table" tabIndex={0} aria-label="Byte frequency counts">
          <table>
            <thead>
              <tr>
                <th>Byte</th>
                <th>Count</th>
              </tr>
            </thead>
            <tbody>
              {analysis.byteFrequency.map((count, index) => (
                <tr key={index}>
                  <td>{byte(index)}</td>
                  <td>{count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <p className="diagnostic-disclaimer">
        Diagnostic only. Entropy depends on sample size. Random-looking outputs and randomness tests
        do not prove cryptographic security.
      </p>
    </section>
  );
}
