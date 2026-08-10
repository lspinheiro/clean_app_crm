export default function RosterLoading() {
  return (
    <main
      className="page-shell roster-page-shell roster-loading"
      aria-busy="true"
      aria-label="Loading roster"
    >
      <div className="roster-loading__heading roster-skeleton" aria-hidden="true" />
      <div className="roster-loading__controls roster-skeleton" aria-hidden="true" />
      <div className="roster-loading__grid" aria-hidden="true">
        {Array.from({ length: 5 }, (_, index) => (
          <div className="roster-loading__row" key={index}>
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
