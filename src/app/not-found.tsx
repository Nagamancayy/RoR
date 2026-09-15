import Link from 'next/link';
import { ArrowLeft, FlaskConical } from 'lucide-react';

export default function NotFound() {
  return (
    <section className="not-found">
      <div className="eyebrow">404 / PAGE NOT FOUND</div>
      <h1>This page is outside the experiment.</h1>
      <p>
        The link may be incomplete, or this page may no longer exist. Return to your workspace to
        continue.
      </p>
      <div className="button-row justify-center">
        <Link className="button secondary" href="/">
          <ArrowLeft size={15} aria-hidden="true" />
          Back to dashboard
        </Link>
        <Link className="button primary" href="/experiments/new">
          <FlaskConical size={15} aria-hidden="true" />
          New experiment
        </Link>
      </div>
    </section>
  );
}
