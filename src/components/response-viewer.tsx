'use client';

import { useMemo } from 'react';
import type { DisplayConfig, PublicQuery } from '@/lib/public-types';
import { ascii, decodeInput, encodeBytes } from './bytes';
import { CopyButton, Empty, formatDate } from './common';

function ByteField({
  field,
  display,
}: {
  field: PublicQuery['response']['fields'][number];
  display: DisplayConfig;
}) {
  const bytes = useMemo(() => decodeInput(field.value, 'hex'), [field.value]);
  const canonical = useMemo(
    () => encodeBytes(bytes, display.responseEncoding),
    [bytes, display.responseEncoding],
  );
  let presented = canonical;
  if (display.responseEncoding === 'hex') {
    if (display.uppercase) presented = presented.toUpperCase();
    if (display.groupBytes > 0)
      presented =
        presented.match(new RegExp(`.{1,${display.groupBytes * 2}}`, 'g'))?.join(' ') || '';
  }
  const preview = presented.slice(0, 16384);
  return (
    <div className="response-field">
      <div className="byte-field-heading">
        <div className="byte-field-name">
          {field.name}
          <span>{field.byteLength.toLocaleString()} bytes</span>
        </div>
        <CopyButton value={canonical} label={`Copy ${field.name}`} />
      </div>
      <pre className="byte-data" data-testid={`response-field-${field.name}`} tabIndex={0}>
        {preview || '∅  empty byte string'}
        {presented.length > 16384 && '\n… Preview truncated. Copy or export for the full value.'}
      </pre>
      {display.asciiPreview && (
        <div className="ascii-preview">
          <span>ASCII</span>
          <code tabIndex={0} aria-label={`${field.name} ASCII preview`}>
            {bytes.length ? ascii(bytes.subarray(0, 2048)) : '(empty)'}
            {bytes.length > 2048 && '…'}
          </code>
        </div>
      )}
    </div>
  );
}

export function ResponseViewer({
  query,
  display,
  setDisplay,
}: {
  query?: PublicQuery;
  display: DisplayConfig;
  setDisplay: (display: DisplayConfig) => void;
}) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">ORACLE OUTPUT</span>
          <h2>
            {query
              ? `Response · Query ${String(query.index).padStart(2, '0')}`
              : 'Awaiting your first query'}
          </h2>
        </div>
        <div className="response-toolbar">
          <div className="segmented" aria-label="Response encoding">
            <button
              type="button"
              aria-pressed={display.responseEncoding === 'hex'}
              onClick={() => setDisplay({ ...display, responseEncoding: 'hex' })}
            >
              Hex
            </button>
            <button
              type="button"
              aria-pressed={display.responseEncoding === 'base64'}
              onClick={() => setDisplay({ ...display, responseEncoding: 'base64' })}
            >
              Base64
            </button>
          </div>
        </div>
      </div>
      {query ? (
        <>
          <div className="response-meta">
            <span>{formatDate(query.createdAt)}</span>
            <span>Input: {query.inputByteLength.toLocaleString()} B</span>
            <span>Output: {query.response.totalByteLength.toLocaleString()} B</span>
          </div>
          <div className="response-fields">
            {query.response.fields.map((field) => (
              <ByteField key={field.name} field={field} display={display} />
            ))}
          </div>
        </>
      ) : (
        <Empty
          title="The oracle is ready"
          description="Submit a query to inspect the public response bytes here."
          action={false}
        />
      )}
      <div className="display-options">
        <label>
          Group bytes
          <select
            value={display.groupBytes}
            onChange={(event) =>
              setDisplay({
                ...display,
                groupBytes: Number(event.target.value) as DisplayConfig['groupBytes'],
              })
            }
          >
            <option value={0}>None</option>
            <option value={2}>2</option>
            <option value={4}>4</option>
            <option value={8}>8</option>
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={display.uppercase}
            onChange={(event) => setDisplay({ ...display, uppercase: event.target.checked })}
          />
          Uppercase
        </label>
        <label>
          <input
            type="checkbox"
            checked={display.asciiPreview}
            onChange={(event) => setDisplay({ ...display, asciiPreview: event.target.checked })}
          />
          ASCII preview
        </label>
      </div>
    </section>
  );
}
