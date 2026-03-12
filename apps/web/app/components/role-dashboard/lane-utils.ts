export type ColumnVariant = "row" | "column";

export const PER_ITEM_DURATION_MIN_SECONDS = 14;
export const PER_ITEM_DURATION_MAX_SECONDS = 20;
export const LOOP_SEGMENT_COUNT = 3;
export const LOOP_SEGMENT_INDICES = [0, 1, 2] as const;

export function buildLanes<T>(items: T[], laneCount: number): T[][] {
  const safeLaneCount = Math.max(1, Math.floor(Number(laneCount) || 1));
  const lanes = Array.from({ length: safeLaneCount }, () => [] as T[]);
  items.forEach((item, index) => {
    lanes[index % safeLaneCount].push(item);
  });
  if (items.length > 0) {
    lanes.forEach((lane, laneIndex) => {
      if (lane.length === 0) {
        lane.push(items[laneIndex % items.length]);
      }
    });
  }
  return lanes;
}

export function buildLaneRandomDurations(laneCount: number): number[] {
  return Array.from({ length: laneCount }, () => {
    const random = Math.random();
    return (
      PER_ITEM_DURATION_MIN_SECONDS +
      random * (PER_ITEM_DURATION_MAX_SECONDS - PER_ITEM_DURATION_MIN_SECONDS)
    );
  });
}
