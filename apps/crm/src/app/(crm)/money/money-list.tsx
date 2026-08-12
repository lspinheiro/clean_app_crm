import Link from "next/link";

import {
  formatMoneyAmount,
  formatMoneyJobDate,
  formatMoneyJobTime,
  formatMoneyStatus,
} from "@/features/money/format";
import type { CompanyMoneyLedger } from "@/features/money/types";

type MoneyListProps = {
  ledger: CompanyMoneyLedger;
};

export function MoneyList({ ledger }: MoneyListProps) {
  return (
    <>
      <section aria-label="Money totals" className="money-totals">
        <h2 className="visually-hidden">Money totals</h2>
        <dl>
          <div>
            <dt>Total owed</dt>
            <dd>
              <strong className="tabular-numerals">
                {formatMoneyAmount(ledger.owedCents)}
              </strong>
              <span>Awaiting settlement</span>
            </dd>
          </div>
          <div>
            <dt>Total paid</dt>
            <dd>
              <strong className="tabular-numerals">
                {formatMoneyAmount(ledger.paidCents)}
              </strong>
              <span>Recorded as settled</span>
            </dd>
          </div>
        </dl>
      </section>

      {ledger.entries.length ? (
        <section aria-labelledby="money-history-heading" className="money-history">
          <div className="money-history-header">
            <h2 id="money-history-heading">Pay history</h2>
            <p className="money-entry-count tabular-numerals">
              {ledger.entries.length} {ledger.entries.length === 1 ? "entry" : "entries"}
            </p>
          </div>
          <div
            aria-label="Company pay ledger table"
            className="money-table-region"
            role="region"
            tabIndex={0}
          >
            <table className="money-table">
              <caption>Company pay ledger</caption>
              <thead>
                <tr>
                  <th scope="col">Cleaner</th>
                  <th scope="col">Job</th>
                  <th scope="col">Site</th>
                  <th scope="col">Amount</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {ledger.entries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="money-cleaner-name">{entry.cleanerName}</td>
                    <td>
                      <Link
                        aria-label={`Job at ${entry.siteName} on ${formatMoneyJobDate(entry.scheduledStart)}`}
                        className="money-job-link"
                        href={`/jobs/${entry.jobId}`}
                      >
                        <time dateTime={entry.scheduledStart}>
                          <strong>{formatMoneyJobDate(entry.scheduledStart)}</strong>
                          <span className="tabular-numerals">
                            {formatMoneyJobTime(entry.scheduledStart)}
                          </span>
                        </time>
                      </Link>
                    </td>
                    <td>{entry.siteName}</td>
                    <td>
                      <strong className="money-amount tabular-numerals">
                        {formatMoneyAmount(entry.amountCents)}
                      </strong>
                    </td>
                    <td>
                      <span className={`money-status money-status--${entry.status}`}>
                        {formatMoneyStatus(entry.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section className="money-empty">
          <h2>No pay history yet</h2>
          <p>
            Completed jobs will appear here as one agreed-pay entry for each crew slot.
          </p>
        </section>
      )}
    </>
  );
}
