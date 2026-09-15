'use client';

import Link from 'next/link';
import {
  ArrowRight,
  Check,
  Copy,
  Download,
  FlaskConical,
  Info,
  LoaderCircle,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    cache: 'no-store',
  });
  const body = await response.json();
  if (!response.ok)
    throw new Error(body.error?.message || 'The request could not be completed. Please try again.');
  return body as T;
}

export function useResource<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let current = true;
    api<T>(path)
      .then((result) => {
        if (current) {
          setData(result);
          setError('');
        }
      })
      .catch((reason: unknown) => {
        if (current)
          setError(reason instanceof Error ? reason.message : 'Unable to load this page.');
      });
    return () => {
      current = false;
    };
  }, [path, version]);
  return { data, setData, error, refresh: () => setVersion((v) => v + 1) };
}

export function PageHeading({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions && <div className="heading-actions">{actions}</div>}
    </div>
  );
}

export function Notice({
  children,
  warning = false,
}: {
  children: React.ReactNode;
  warning?: boolean;
}) {
  return (
    <div className={`notice ${warning ? 'warning' : ''}`}>
      <Info size={17} aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}
export function ErrorNotice({ message }: { message: string }) {
  return message ? (
    <div role="alert" className="error-notice">
      <Info size={17} aria-hidden="true" />
      {message}
    </div>
  ) : null;
}
export function Loading() {
  return (
    <div className="loading-state" role="status">
      <LoaderCircle size={22} className="spin" aria-hidden="true" />
      <span>Loading your workspace…</span>
    </div>
  );
}
export function Empty({
  title = 'No experiments yet',
  description = 'Start a blind experiment and explore what the outputs reveal.',
  action = true,
}: {
  title?: string;
  description?: string;
  action?: boolean;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <FlaskConical size={25} strokeWidth={1.5} aria-hidden="true" />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action && (
        <Link className="text-link" href="/experiments/new">
          Create your first experiment <ArrowRight size={15} aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}
export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`badge status-${status.toLowerCase()}`}>
      <span className="badge-dot" />
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}
export function ExportButtons({ id }: { id: string }) {
  return (
    <div className="button-row">
      <a
        className="button small secondary"
        href={`/api/experiments/${id}/export?format=json`}
        download
      >
        <Download size={14} aria-hidden="true" />
        Export JSON
      </a>
      <a
        className="button small secondary"
        href={`/api/experiments/${id}/export?format=csv`}
        download
      >
        <Download size={14} aria-hidden="true" />
        Export CSV
      </a>
    </div>
  );
}
export function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timeout.current) clearTimeout(timeout.current);
    },
    [],
  );
  return (
    <button
      type="button"
      className="copy-button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setState('copied');
        } catch {
          setState('failed');
        }
        if (timeout.current) clearTimeout(timeout.current);
        timeout.current = setTimeout(() => setState('idle'), 2500);
      }}
    >
      {state === 'copied' ? (
        <Check size={13} aria-hidden="true" />
      ) : (
        <Copy size={13} aria-hidden="true" />
      )}
      <span aria-live="polite">
        {state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : label}
      </span>
    </button>
  );
}
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  onCancel,
  onConfirm,
  busy = false,
  danger = false,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  busy?: boolean;
  danger?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog?.open) dialog?.showModal();
    if (!open && dialog?.open) dialog.close();
  }, [open]);
  return (
    <dialog
      className="confirm-dialog"
      ref={ref}
      aria-labelledby="confirmation-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <div className="dialog-heading">
        <span className="eyebrow">CONFIRM YOUR ACTION</span>
        <button
          type="button"
          aria-label="Close confirmation"
          disabled={busy}
          className="icon-button"
          onClick={onCancel}
        >
          <X size={18} />
        </button>
      </div>
      <h2 id="confirmation-title">{title}</h2>
      <div className="dialog-copy">{children}</div>
      <div className="dialog-actions">
        <button
          type="button"
          className="button secondary"
          autoFocus
          disabled={busy}
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          className={`button ${danger ? 'danger' : 'primary'}`}
          onClick={onConfirm}
          disabled={busy}
        >
          {busy && <LoaderCircle size={16} className="spin" aria-hidden="true" />}
          {busy ? 'Saving…' : confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
export function Metric({
  label,
  value,
  note,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  note: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="metric-card">
      <div className="metric-label">
        {label}
        {icon}
      </div>
      <div className="metric-value">{value}</div>
      <div className="metric-note">{note}</div>
    </div>
  );
}
export function formatDate(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
export function kindLabel(value: string) {
  return value === 'PRF_ROR' ? 'PRF RoR' : 'Encryption RoR';
}
export function percent(value: number | null | undefined, digits = 1) {
  return value == null ? '—' : `${(value * 100).toFixed(digits)}%`;
}
export function number(value: number | null | undefined, digits = 0) {
  return value == null ? '—' : value.toLocaleString(undefined, { maximumFractionDigits: digits });
}
