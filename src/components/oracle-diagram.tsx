import { ArrowDown, ArrowRight, Binary, Fingerprint, LockKeyhole } from 'lucide-react';

export function OracleDiagram({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`oracle-diagram ${compact ? 'compact' : ''}`}
      aria-label="A distinguisher sends input to a hidden challenger, receives an output, and guesses the fixed world."
    >
      <div className="diagram-caption">
        <span className="caption-dot" /> THE REAL-OR-RANDOM GAME
      </div>
      <div className="diagram-flow">
        <div className="diagram-input">
          <span className="diagram-square">
            <Fingerprint size={23} strokeWidth={1.5} aria-hidden="true" />
          </span>
          <span>Distinguisher</span>
          <small>query x</small>
        </div>
        <span className="diagram-connection">
          <span className="connection-line" />
          <ArrowRight size={16} aria-hidden="true" />
        </span>
        <div className="challenger">
          <div className="challenger-top">
            <LockKeyhole size={16} aria-hidden="true" />
            <span>Hidden challenger</span>
          </div>
          <div className="world-choices">
            <span>REAL</span>
            <span className="world-or">or</span>
            <span>RANDOM</span>
          </div>
          <div className="challenger-bottom">One world. Fixed for the session.</div>
        </div>
        <span className="diagram-connection">
          <span className="connection-line" />
          <ArrowRight size={16} aria-hidden="true" />
        </span>
        <div className="diagram-output">
          <span className="diagram-square">
            <Binary size={24} strokeWidth={1.5} aria-hidden="true" />
          </span>
          <span>Response</span>
          <small>output y</small>
        </div>
      </div>
      <div className="diagram-return">
        <span />
        <ArrowDown size={13} aria-hidden="true" />
        <p>Observe. Query. Make your guess.</p>
        <span />
      </div>
    </div>
  );
}
