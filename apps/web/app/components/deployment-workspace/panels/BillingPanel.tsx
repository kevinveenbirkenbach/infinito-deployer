import { useMemo } from "react";
import styles from "../../DeploymentWorkspace.module.css";

type BillingPanelProps = {
  hardwareCount: number;
  selectedAppsCount: number;
};

type BillingRow = {
  item: string;
  quantity: number;
  unit: number;
  recurring: number;
  setup: number;
};

function buildBillingRows(hardwareCount: number, selectedAppsCount: number): BillingRow[] {
  const supportSeats = hardwareCount > 0 ? 1 : 0;
  return [
    {
      item: "Hardware management",
      quantity: hardwareCount,
      unit: 9,
      recurring: hardwareCount * 9,
      setup: hardwareCount * 29,
    },
    {
      item: "Software workload",
      quantity: selectedAppsCount,
      unit: 3,
      recurring: selectedAppsCount * 3,
      setup: 0,
    },
    {
      item: "Support baseline",
      quantity: supportSeats,
      unit: 19,
      recurring: supportSeats * 19,
      setup: 0,
    },
  ];
}

export default function BillingPanel({
  hardwareCount,
  selectedAppsCount,
}: BillingPanelProps) {
  const rows = useMemo(
    () => buildBillingRows(hardwareCount, selectedAppsCount),
    [hardwareCount, selectedAppsCount]
  );
  const recurringTotal = rows.reduce((sum, row) => sum + row.recurring, 0);
  const setupTotal = rows.reduce((sum, row) => sum + row.setup, 0);

  return (
    <div className={styles.billingPanel}>
      <div className={styles.billingTableWrap}>
        <table className={styles.billingTable}>
          <thead>
            <tr>
              <th>Position</th>
              <th>Menge</th>
              <th>Einzelpreis (EUR/Monat)</th>
              <th>Laufend (EUR/Monat)</th>
              <th>Einmalig (EUR)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.item}>
                <td>{row.item}</td>
                <td>{row.quantity}</td>
                <td>{row.unit.toFixed(2)}</td>
                <td>{row.recurring.toFixed(2)}</td>
                <td>{row.setup.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Summe</td>
              <td />
              <td />
              <td>{recurringTotal.toFixed(2)}</td>
              <td>{setupTotal.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className={styles.billingHint}>
        Placeholder-Matrix fuer den ersten Billing-Ueberblick.
      </p>
    </div>
  );
}
