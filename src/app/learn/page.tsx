import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, BookOpen, FlaskConical } from 'lucide-react';
import { Notice, PageHeading } from '@/components/common';
import { OracleDiagram } from '@/components/oracle-diagram';

export const metadata: Metadata = {
  title: 'Field guide',
  description:
    'Understand blind oracle experiments, random functions, and the limits of empirical cryptographic evidence.',
};

const sections = [
  ['the-game', '01 · The hidden-world game'],
  ['two-oracles', '02 · Two kinds of oracle'],
  ['byte-identity', '03 · Think in bytes'],
  ['diagnostics', '04 · Read the diagnostics'],
  ['advantage', '05 · Measure your advantage'],
  ['reproducibility', '06 · Reproduce your research'],
] as const;

export default function LearnPage() {
  return (
    <>
      <PageHeading
        eyebrow="THE FIELD GUIDE"
        title="Understand the experiment."
        description="One hidden world, a sequence of questions, and a final decision. Learn what the evidence can tell you."
        actions={
          <Link className="button primary" href="/experiments/new">
            <FlaskConical size={15} aria-hidden="true" />
            Start an experiment
          </Link>
        }
      />
      <div className="learn-layout">
        <article className="learn-main">
          <div className="learn-intro">
            <p>
              Real-or-Random is a way to ask a precise question: can a distinguisher tell a
              cryptographic construction from its random-world simulator by observing oracle
              responses? In this lab, you are the distinguisher.
            </p>
          </div>
          <div
            className="learn-diagram"
            role="img"
            aria-label="You send input to a challenger that keeps one fixed hidden world, REAL or RANDOM. It returns an output. You may query again, then lock a final guess before the world is revealed."
          >
            <OracleDiagram />
          </div>

          <section className="learn-section" id="the-game" aria-labelledby="game-title">
            <div className="eyebrow">01 / THE EXPERIMENT</div>
            <h2 id="game-title">One world. Fixed until the end.</h2>
            <p>
              When you start, the server secretly chooses <strong>REAL</strong> or{' '}
              <strong>RANDOM</strong> with equal probability. This choice stays fixed for the whole
              experiment. The browser receives public configuration and responses; the hidden world
              and cryptographic keys stay on the server.
            </p>
            <ol>
              <li>
                <strong>Configure.</strong> Choose an algorithm and a query budget.
              </li>
              <li>
                <strong>Observe.</strong> Submit inputs and inspect the resulting transcript. Later
                queries can depend on what you have observed.
              </li>
              <li>
                <strong>Decide.</strong> Guess REAL or RANDOM, then confirm. Your final guess is
                irreversible and ends querying.
              </li>
              <li>
                <strong>Review.</strong> After your guess is committed, see the world, your result,
                and the public transcript.
              </li>
            </ol>
            <p>
              Reaching the query limit leaves the guess controls available. Aborting ends the
              experiment without revealing the world or counting it toward guessing accuracy.
            </p>
          </section>

          <section className="learn-section" id="two-oracles" aria-labelledby="oracles-title">
            <div className="eyebrow">02 / ORACLE SEMANTICS</div>
            <h2 id="oracles-title">Encryption and functions have different rules.</h2>
            <div className="comparison-cards">
              <div className="panel comparison-card">
                <div className="eyebrow">ENCRYPTION ROR</div>
                <h3>AES-256-GCM</h3>
                <p>
                  REAL encrypts your plaintext under one experiment key, using a fresh nonce for
                  each query. RANDOM returns fresh random bytes in the same public fields.
                </p>
                <code>nonce + ciphertext + tag</code>
                <p>
                  The nonce is 12 bytes, ciphertext matches the input length, and the tag is 16
                  bytes. Repeating a plaintext may produce a different response in either world.
                </p>
              </div>
              <div className="panel comparison-card">
                <div className="eyebrow">PRF ROR</div>
                <h3>HMAC-SHA-256 PRF</h3>
                <p>
                  REAL evaluates a keyed function. RANDOM maintains a random function: each input
                  receives a value that stays fixed for that experiment.
                </p>
                <code>same input → same output</code>
                <p>
                  Repeats are stable in both worlds. Output length is configurable from 8 to 32
                  bytes. A new experiment gets an independent function in the default random mode.
                </p>
              </div>
            </div>
            <p>
              <strong>Public shape must match.</strong> For the same input and configuration, both
              worlds expose the same field names, encodings, and byte lengths. A structural mismatch
              would give away the answer without testing the intended construction.
            </p>
          </section>

          <section className="learn-section" id="byte-identity" aria-labelledby="bytes-title">
            <div className="eyebrow">03 / INPUTS AND REPRESENTATIONS</div>
            <h2 id="bytes-title">Different text can mean identical bytes.</h2>
            <p>
              The oracle operates on decoded bytes. These three inputs are the same two-byte
              message:
            </p>
            <div
              className="formula"
              tabIndex={0}
              aria-label="UTF-8 hi equals hexadecimal 6869 equals base64 aGk equals."
            >
              UTF-8: hi &nbsp; = &nbsp; Hex: 6869 &nbsp; = &nbsp; Base64: aGk=
            </div>
            <p>
              For a PRF experiment, all three produce the same output within one session. Changing
              the display between hex and Base64 changes only the representation. Empty input is
              valid; AES-GCM still returns its nonce and authentication tag with zero ciphertext
              bytes.
            </p>
            <p>
              The composer accepts strict hex and standard padded Base64, and rejects malformed
              encodings. Each query has a maximum decoded input size of 1 MiB.
            </p>
          </section>

          <section className="learn-section" id="diagnostics" aria-labelledby="diagnostics-title">
            <div className="eyebrow">04 / PUBLIC EVIDENCE</div>
            <h2 id="diagnostics-title">Random-looking is a starting observation.</h2>
            <p>
              The frequency chart counts output bytes from 0 to 255, including public nonces and
              tags. Entropy summarizes the observed byte distribution; the mean, printable fraction,
              and duplicate counts describe other properties of that sample.
            </p>
            <p>
              A sequence containing every byte once has an empirical entropy of{' '}
              <strong>8 bits per byte</strong>. That sequence could still be completely predictable.
              Likewise, a short sample of good random output can look uneven.
            </p>
            <Notice>
              These statistics are diagnostics only. High entropy, stable repeats, or passing
              randomness tests do not prove cryptographic security. Formal security depends on the
              precise oracle model, the distinguisher&apos;s capabilities, query limits, key
              handling, and assumptions.
            </Notice>
          </section>

          <section className="learn-section" id="advantage" aria-labelledby="advantage-title">
            <div className="eyebrow">05 / AGGREGATE RESULTS</div>
            <h2 id="advantage-title">Measure performance across experiments.</h2>
            <p>
              Let <strong>N</strong> be the number of completed experiments and <strong>C</strong>{' '}
              the number of correct guesses. Individual queries are observations within an
              experiment; each completed experiment contributes one guess.
            </p>
            <div
              className="formula"
              tabIndex={0}
              aria-label="Observed success rate p hat equals C divided by N. Empirical advantage equals the absolute value of 2 times p hat minus 1."
            >
              p̂ = C / N &nbsp;&nbsp; Adv̂ = |2p̂ − 1|
            </div>
            <p>
              For example, 60 correct guesses out of 100 gives a 60% observed success rate and an
              empirical advantage of 0.20. A 40% success rate also gives 0.20: consistently
              reversing those guesses would yield 60%.
            </p>
            <ul>
              <li>
                <strong>Wilson 95% interval:</strong> shows sampling uncertainty around your
                observed success probability under a binomial model.
              </li>
              <li>
                <strong>Exact binomial p-value:</strong> measures how unusual an outcome at least as
                extreme would be under independent 50% guessing. It is not the probability that the
                cipher is secure.
              </li>
              <li>
                <strong>Small samples:</strong> fewer than 20 completed experiments trigger a
                caution. Even larger samples require careful interpretation.
              </li>
            </ul>
            <p>
              Keep all planned trials, including incorrect guesses. Changing strategies, selecting
              favorable results, or repeatedly checking for significance can complicate the
              conclusions. Observed 50% success does not prove security; one successful
              distinguisher is not automatically a formal cryptanalytic proof.
            </p>
            <Link className="text-link" href="/statistics">
              Explore your aggregate results <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </section>

          <section
            className="learn-section"
            id="reproducibility"
            aria-labelledby="reproducibility-title"
          >
            <div className="eyebrow">06 / RESEARCH PRACTICE</div>
            <h2 id="reproducibility-title">Replay deliberately. Interpret carefully.</h2>
            <p>
              Default experiments use the operating system&apos;s cryptographic random source.
              Optional <strong>reproducible mode</strong> derives experiment randomness from a seed.
              The same seed, public configuration, and query sequence reproduce the hidden world and
              oracle responses.
            </p>
            <p>
              The application keeps its stored seed out of active responses and exports. After
              completion, it reveals the seed only when you enabled that option. Cryptographic keys
              remain private even after the final guess.
            </p>
            <Notice warning>
              A seed you already know can let you reconstruct the world. Use known-seed replay to
              check reproducibility, and treat repeated copies of the same seeded experiment as
              dependent observations. They do not provide new independent guessing trials.
            </Notice>
            <p>
              JSON and CSV exports preserve public research data for further analysis. Keep the
              configuration and experiment method alongside your results, and use formal
              cryptanalysis to investigate any apparent distinguisher.
            </p>
            <div className="button-row">
              <Link className="button primary" href="/experiments/new">
                Start Blind Experiment <ArrowRight size={15} aria-hidden="true" />
              </Link>
              <Link className="button secondary" href="/history">
                Review experiment history
              </Link>
            </div>
          </section>
        </article>

        <aside className="panel learn-side" aria-label="Field guide navigation">
          <div className="eyebrow">
            <BookOpen size={16} aria-hidden="true" />
          </div>
          <h3>In this guide</h3>
          <nav aria-label="On this page">
            {sections.map(([id, label]) => (
              <Link key={id} href={`#${id}`}>
                {label}
              </Link>
            ))}
          </nav>
          <Link className="button primary" href="/experiments/new">
            Try the experiment <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </aside>
      </div>
    </>
  );
}
