'use client';
import { useRef, useState } from 'react';
import { api, ErrorNotice } from './common';
import type { ModifvigneCheck } from '@/lib/oracle/modifvigne-check-contract';
export default function ModifvigneCheckPanel() {
  const [result, setResult] = useState<ModifvigneCheck | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const pending = useRef(false);
  async function check() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      setResult(
        await api<ModifvigneCheck>('/api/algorithms/modifvigne-v3-4/check', {
          method: 'POST',
          body: '{}',
        }),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Check failed.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="field">
      <h3>Original Python · v3.4</h3>
      <p className="field-hint">
        Both source files are preserved byte for byte and verified before execution. UTF-8 input
        only, up to 127 bytes. Each round uses a hidden 32-character Base64 key (192 random bits).
        Salt and padding use the original Python randomness.
      </p>
      <button type="button" className="button secondary" disabled={busy} onClick={check}>
        {busy ? 'Checking original files…' : 'Check encryption / decryption'}
      </button>
      <ErrorNotice message={error} />
      <div role="status" aria-live="polite">
        {result && (
          <>
            <p>
              Checked {result.cases.length} independent fixtures. These checks do not use experiment
              keys or reveal a hidden world.
            </p>
            <ul>
              {result.cases.map((item) => (
                <li key={item.label}>
                  <strong>{item.label}</strong>: bytes {item.bytesMatch ? 'match' : 'DIFFER'}, tag{' '}
                  {item.tagVerified ? 'verified' : 'FAILED'}, displayed text{' '}
                  {item.textMatches ? 'matches' : 'DIFFERS'} ({item.inputBytes} → {item.outputBytes}{' '}
                  bytes).
                </li>
              ))}
            </ul>
            <p className="field-hint">
              The original decryptor displays Latin-1 while encryption accepts UTF-8. Unicode can
              recover identical bytes with different displayed text. This behavior is preserved.
              Passing these fixtures is a correctness observation, not evidence of cryptographic
              security.
            </p>
            <a
              className="button secondary"
              download="modifvigne-v3-4-correctness.json"
              href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(result, null, 2))}`}
            >
              Download check report
            </a>
          </>
        )}
      </div>
    </div>
  );
}
