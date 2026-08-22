import { useTranslations } from "next-intl";

export type RouteLoadingVariant =
  | "clients"
  | "clientDetail"
  | "clientImport"
  | "jobs"
  | "newJob"
  | "jobDetail"
  | "money"
  | "cleaners"
  | "settings";

type RouteLoadingSkeletonProps = {
  variant: RouteLoadingVariant;
};

const shellClasses: Record<RouteLoadingVariant, string> = {
  clients: "",
  clientDetail: "client-detail-shell",
  clientImport: "import-page",
  jobs: "jobs-page-shell",
  newJob: "new-job-page-shell",
  jobDetail: "job-detail-page-shell",
  money: "money-page-shell",
  cleaners: "cleaners-page-shell",
  settings: "settings-shell",
};

function Skeleton({ className = "" }: { className?: string }) {
  return <span className={`route-skeleton ${className}`.trim()} />;
}

function HeaderSkeleton({
  action = false,
  className,
  descriptionLines = 1,
  eyebrow = false,
}: {
  action?: boolean;
  className: string;
  descriptionLines?: number;
  eyebrow?: boolean;
}) {
  return (
    <header className={className}>
      <div className="route-loading__header-copy">
        {eyebrow ? <Skeleton className="route-loading__eyebrow" /> : null}
        <Skeleton className="route-loading__heading" />
        {Array.from({ length: descriptionLines }, (_, index) => (
          <Skeleton className="route-loading__description" key={index} />
        ))}
      </div>
      {action ? <Skeleton className="route-loading__action" /> : null}
    </header>
  );
}

function ClientsGeometry() {
  return (
    <>
      <HeaderSkeleton className="page-header-row clients-page-header" eyebrow />
      <div className="clients-toolbar">
        <Skeleton className="clients-loading__search" />
        <div className="clients-toolbar__actions">
          <Skeleton className="route-loading__action" />
          <Skeleton className="route-loading__action" />
        </div>
      </div>
      <div className="client-list">
        {Array.from({ length: 2 }, (_, cardIndex) => (
          <article className="client-card clients-loading__card" key={cardIndex}>
            <div className="client-card__header">
              <div className="route-loading__stack">
                <Skeleton className="route-loading__eyebrow" />
                <Skeleton className="route-loading__title" />
                <Skeleton className="route-loading__copy" />
              </div>
              <Skeleton className="route-loading__action" />
            </div>
            {Array.from({ length: 2 }, (_, rowIndex) => (
              <div className="site-row clients-loading__site-row" key={rowIndex}>
                <Skeleton className="route-loading__circle" />
                <div className="route-loading__stack">
                  <Skeleton className="route-loading__copy route-loading__copy--short" />
                  <Skeleton className="route-loading__copy" />
                </div>
              </div>
            ))}
          </article>
        ))}
      </div>
    </>
  );
}

function ClientDetailGeometry() {
  return (
    <>
      <div className="breadcrumb"><Skeleton className="route-loading__breadcrumb" /></div>
      <HeaderSkeleton action className="client-detail-header" descriptionLines={2} eyebrow />
      <section className="site-detail-list">
        {Array.from({ length: 2 }, (_, cardIndex) => (
          <section
            className="site-detail-card client-detail-loading__site-card"
            key={cardIndex}
          >
            <div className="client-detail-loading__site-summary">
              <div className="route-loading__stack">
                <Skeleton className="route-loading__title" />
                <Skeleton className="route-loading__copy" />
              </div>
              <Skeleton className="route-loading__chevron" />
            </div>
            {cardIndex === 0 ? (
              <div className="site-detail-content client-detail-loading__site-content">
                <div className="site-address-block">
                  <Skeleton className="route-loading__circle" />
                  <div className="route-loading__stack">
                    <Skeleton className="route-loading__copy" />
                    <Skeleton className="route-loading__copy route-loading__copy--short" />
                  </div>
                </div>
                <Skeleton className="client-detail-loading__panel" />
                <div className="defaults-grid client-detail-loading__facts">
                  {Array.from({ length: 3 }, (_, factIndex) => (
                    <div className="client-detail-loading__fact" key={factIndex}>
                      <Skeleton className="route-loading__copy route-loading__copy--short" />
                      <Skeleton className="route-loading__title" />
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        ))}
      </section>
    </>
  );
}

function ClientImportGeometry() {
  return (
    <>
      <Skeleton className="route-loading__back" />
      <HeaderSkeleton className="import-page__header" />
      <div className="import-workspace">
        <section className="import-templates">
          <Skeleton className="route-loading__section-heading" />
          <div className="import-template-grid import-loading__template-grid">
            {Array.from({ length: 2 }, (_, index) => (
              <div className="import-template import-loading__template" key={index}>
                <Skeleton className="route-loading__title" />
                {Array.from({ length: 3 }, (__, rowIndex) => (
                  <Skeleton className="import-loading__contract-row" key={rowIndex} />
                ))}
              </div>
            ))}
          </div>
        </section>
        <section className="import-picker">
          <Skeleton className="route-loading__section-heading import-loading__picker-heading" />
          {Array.from({ length: 2 }, (_, index) => (
            <div className="import-loading__picker-column" key={index}>
              <Skeleton className="route-loading__copy route-loading__copy--short" />
              <Skeleton className="import-loading__field" />
            </div>
          ))}
        </section>
      </div>
    </>
  );
}

function JobsGeometry() {
  return (
    <>
      <HeaderSkeleton action className="jobs-page-header" />
      <ul className="job-list">
        {Array.from({ length: 4 }, (_, index) => (
          <li className="job-list-item" key={index}>
            <div className="job-list-link jobs-loading__row">
              <Skeleton className="route-loading__copy route-loading__copy--short" />
              <div className="route-loading__stack">
                <Skeleton className="route-loading__title" />
                <Skeleton className="route-loading__copy" />
              </div>
              <div className="route-loading__stack job-pay">
                <Skeleton className="route-loading__copy route-loading__copy--short" />
                <Skeleton className="route-loading__title" />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

function NewJobGeometry() {
  const gridClasses = ["new-job-grid--two", "new-job-grid--trio", "new-job-grid--three"];
  return (
    <>
      <Skeleton className="route-loading__back" />
      <HeaderSkeleton className="new-job-page-header" eyebrow />
      <div className="new-job-form">
        {gridClasses.map((gridClass, sectionIndex) => (
          <section className="new-job-section new-job-loading__section" key={gridClass}>
            <div className="route-loading__stack">
              <Skeleton className="route-loading__eyebrow" />
              <Skeleton className="route-loading__title" />
            </div>
            <div className={`new-job-grid ${gridClass}`}>
              {Array.from({ length: sectionIndex === 0 ? 2 : 3 }, (_, fieldIndex) => (
                <div className="route-loading__field" key={fieldIndex}>
                  <Skeleton className="route-loading__copy route-loading__copy--short" />
                  <Skeleton className="route-loading__input" />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

function JobDetailGeometry() {
  const factCounts = [3, 2, 2, 2];
  return (
    <>
      <Skeleton className="route-loading__back" />
      <HeaderSkeleton action className="job-detail-header" eyebrow />
      {factCounts.map((factCount, sectionIndex) => (
        <section className="job-detail-section job-detail-loading__section" key={sectionIndex}>
          <div className="route-loading__stack">
            <Skeleton className="route-loading__eyebrow" />
            <Skeleton className="route-loading__title" />
          </div>
          <div className={sectionIndex === 1 ? "job-commercial-facts" : "job-detail-facts"}>
            {Array.from({ length: factCount }, (_, factIndex) => (
              <div className="job-detail-loading__fact" key={factIndex}>
                <Skeleton className="route-loading__copy route-loading__copy--short" />
                <Skeleton className="route-loading__title" />
              </div>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

function MoneyGeometry() {
  return (
    <>
      <HeaderSkeleton className="money-page-header" />
      <section className="money-totals">
        <dl className="money-loading__totals">
          {Array.from({ length: 2 }, (_, index) => (
            <div className="money-loading__total" key={index}>
              <Skeleton className="route-loading__copy route-loading__copy--short" />
              <Skeleton className="money-loading__amount" />
            </div>
          ))}
        </dl>
      </section>
      <section className="money-history">
        <div className="money-history-header">
          <Skeleton className="route-loading__title" />
          <Skeleton className="route-loading__copy route-loading__copy--short" />
        </div>
        <div className="money-table-region">
          <table className="money-table money-loading__table">
            <caption />
            <thead>
              <tr>
                {Array.from({ length: 5 }, (_, index) => (
                  <th key={index}><Skeleton className="route-loading__copy" /></th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 4 }, (_, rowIndex) => (
                <tr className="money-loading__row" key={rowIndex}>
                  {Array.from({ length: 5 }, (__, cellIndex) => (
                    <td className="money-loading__cell" key={cellIndex}>
                      <Skeleton className="route-loading__copy" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function CleanersGeometry() {
  return (
    <>
      <HeaderSkeleton className="page-header-row cleaners-page-header" />
      <div className="cleaners-workspace">
        <section className="cleaners-invite-status">
          <Skeleton className="route-loading__copy" />
          <Skeleton className="route-loading__action" />
        </section>
        <div className="cleaners-layout cleaners-loading__layout">
          <section className="cleaners-invite-card cleaners-loading__card">
            <Skeleton className="route-loading__section-heading" />
            <Skeleton className="cleaners-loading__preview" />
            <Skeleton className="route-loading__action" />
          </section>
          <section className="cleaners-members-card cleaners-loading__card">
            <Skeleton className="route-loading__section-heading" />
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton className="cleaners-loading__member-row" key={index} />
            ))}
          </section>
        </div>
      </div>
    </>
  );
}

function SettingsGeometry() {
  return (
    <>
      <HeaderSkeleton className="page-header-row" descriptionLines={0} eyebrow />
      <div className="settings-form">
        <section className="settings-card settings-loading__card">
          <Skeleton className="route-loading__section-heading" />
          <div className="identity-grid settings-loading__identity-grid">
            <Skeleton className="settings-loading__identity-fields" />
            <Skeleton className="settings-loading__logo" />
          </div>
        </section>
      </div>
      <section className="settings-card employee-management settings-loading__card">
        <Skeleton className="route-loading__section-heading" />
        <div className="employee-management__list">
          {Array.from({ length: 2 }, (_, index) => (
            <div className="employee-management__row settings-loading__row" key={index}>
              <Skeleton className="route-loading__copy" />
              <Skeleton className="route-loading__action" />
              <Skeleton className="route-loading__action" />
            </div>
          ))}
        </div>
      </section>
      <section className="settings-card employee-invitations settings-loading__card">
        <Skeleton className="route-loading__section-heading" />
        <Skeleton className="settings-loading__invitation-form" />
        <div className="employee-invitation-row settings-loading__row">
          <Skeleton className="route-loading__copy" />
          <Skeleton className="route-loading__copy route-loading__copy--short" />
          <Skeleton className="route-loading__action" />
        </div>
      </section>
      <section className="settings-card settings-loading__card">
        <Skeleton className="route-loading__section-heading" />
        <Skeleton className="settings-loading__language" />
      </section>
    </>
  );
}

function Geometry({ variant }: { variant: RouteLoadingVariant }) {
  switch (variant) {
    case "clients": return <ClientsGeometry />;
    case "clientDetail": return <ClientDetailGeometry />;
    case "clientImport": return <ClientImportGeometry />;
    case "jobs": return <JobsGeometry />;
    case "newJob": return <NewJobGeometry />;
    case "jobDetail": return <JobDetailGeometry />;
    case "money": return <MoneyGeometry />;
    case "cleaners": return <CleanersGeometry />;
    case "settings": return <SettingsGeometry />;
  }
}

export function RouteLoadingSkeleton({ variant }: RouteLoadingSkeletonProps) {
  const t = useTranslations("Loading");
  const shellClass = shellClasses[variant];
  return (
    <main
      aria-busy="true"
      aria-label={t(variant)}
      className={`page-shell route-loading ${shellClass}`.trim()}
    >
      <div aria-hidden="true" className={`route-loading__content route-loading__content--${variant}`}>
        <Geometry variant={variant} />
      </div>
    </main>
  );
}
