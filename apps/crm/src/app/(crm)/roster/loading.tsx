export default function RosterLoading() {
  return (
    <main
      className="page-shell roster-page-shell roster-loading"
      aria-busy="true"
      aria-label="Loading roster"
    >
      <header className="roster-header roster-loading__header" aria-hidden="true">
        <div className="roster-loading__header-copy">
          <span className="roster-loading__eyebrow roster-skeleton" />
          <span className="roster-loading__heading roster-skeleton" />
          <div className="roster-loading__toolbar">
            <span
              className="roster-loading__week-controls roster-skeleton"
              data-testid="roster-loading-week-controls"
            />
            <span
              className="roster-loading__view-switch roster-skeleton"
              data-testid="roster-loading-view-switch"
            />
          </div>
        </div>
        <span
          className="roster-loading__gap-count roster-skeleton"
          data-testid="roster-loading-gap-count"
        />
      </header>
      <div className="roster-loading__grid" aria-hidden="true">
        {Array.from({ length: 6 }, (_, index) => (
          <div
            className={`roster-loading__row${index === 0 ? " roster-loading__row--header" : ""}`}
            key={index}
          >
            <span className="roster-skeleton" />
            {Array.from({ length: 7 }, (__, cellIndex) => (
              <span className="roster-skeleton" key={cellIndex} />
            ))}
          </div>
        ))}
      </div>
    </main>
  );
}
