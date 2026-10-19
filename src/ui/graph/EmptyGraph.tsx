// Empty graph view (SCR-02).

/** SCR-02: the empty-state card from the design, shown until the first triple. */
export function EmptyGraph() {
  return (
    <div className="graph-canvas">
      <div className="graph-card">
        <div className="t1">Your graph will appear here</div>
        <figure role="img" aria-label="A subject box joined by a predicate arrow to an object box">
          <div className="node-col">
            <div className="node">CRM</div>
            <span className="cap">Subject</span>
          </div>
          <div className="edge-col">
            <span className="lbl">has dataset</span>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ width: 92, height: 1.5, background: '#8a8a8a' }} />
              <svg width="8" height="10" viewBox="0 0 8 10" aria-hidden="true">
                <path d="M0 0L8 5L0 10z" fill="#8a8a8a" />
              </svg>
            </div>
            <span className="cap">Predicate</span>
          </div>
          <div className="node-col">
            <div className="node">Client Master</div>
            <span className="cap">Object</span>
          </div>
        </figure>
        <div className="tip">
          <b>Tip:</b> start in the Ontology graph to define your classes. You can then pick them as classes when you add
          data.
        </div>
      </div>
    </div>
  );
}
