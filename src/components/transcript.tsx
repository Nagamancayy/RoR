'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { PublicQuery } from '@/lib/public-types';
import { ascii, decodeInput } from './bytes';
import { Empty } from './common';

export function Transcript({
  queries,
  selected,
  onSelect,
}: {
  queries: PublicQuery[];
  selected?: number;
  onSelect: (index: number) => void;
}) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(queries.length / 15));
  const safePage = Math.min(page, pages - 1);
  return (
    <section className="panel" id="transcript">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">YOUR OBSERVATIONS</span>
          <h2>
            Query transcript <span className="count-pill">{queries.length}</span>
          </h2>
        </div>
        <span className="muted" style={{ fontSize: 10 }}>
          Ordered by query
        </span>
      </div>
      {!queries.length ? (
        <Empty
          title="A blank page of evidence"
          description="Every query and public response will be recorded here automatically."
          action={false}
        />
      ) : (
        <>
          <div className="table-scroll">
            <table className="experiment-table transcript-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Time</th>
                  <th>Input preview</th>
                  <th>Input</th>
                  <th>Output</th>
                  <th>Inspect</th>
                </tr>
              </thead>
              <tbody>
                {queries.slice(safePage * 15, safePage * 15 + 15).map((query) => (
                  <tr key={query.id} className={query.index === selected ? 'selected-query' : ''}>
                    <td className="mono">{String(query.index).padStart(2, '0')}</td>
                    <td>
                      {new Date(query.createdAt).toLocaleTimeString(undefined, {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </td>
                    <td>
                      <span className="transcript-input-preview">
                        {query.inputByteLength
                          ? ascii(
                              decodeInput(query.inputBase64.slice(0, 128), 'base64').subarray(
                                0,
                                32,
                              ),
                            )
                          : '∅ empty'}
                        {query.inputByteLength > 32 ? '…' : ''}
                      </span>
                    </td>
                    <td>{query.inputByteLength.toLocaleString()} B</td>
                    <td>{query.response.totalByteLength.toLocaleString()} B</td>
                    <td>
                      <button
                        type="button"
                        className="transcript-row-button"
                        onClick={() => onSelect(query.index)}
                        aria-label={`Inspect query ${query.index}`}
                      >
                        View bytes
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pagination">
            <span>
              {queries.length} quer{queries.length === 1 ? 'y' : 'ies'} · Page {safePage + 1} of{' '}
              {pages}
            </span>
            <div className="pagination-buttons">
              <button
                className="button small secondary"
                disabled={safePage === 0}
                onClick={() => setPage(safePage - 1)}
                aria-label="Previous transcript page"
              >
                <ChevronLeft size={13} />
              </button>
              <button
                className="button small secondary"
                disabled={safePage >= pages - 1}
                onClick={() => setPage(safePage + 1)}
                aria-label="Next transcript page"
              >
                <ChevronRight size={13} />
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
