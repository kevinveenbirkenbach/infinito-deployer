import type { BundleAppListRow } from "./BundleAppList";
import type { Bundle } from "./types";

export type BundleState = {
  enabled: boolean;
  selectedCount: number;
  totalCount: number;
};

export type BundleEntry = {
  bundle: Bundle;
  roleIds: string[];
  roleRows: BundleAppListRow[];
  totalPriceLabel: string;
  state: BundleState;
};
