/// <reference types="bun-types" />
import { describe, expect, it } from "bun:test";
import type { CustomDateRange, TimeframeOption } from "../../src/components/developer-sidebar";

// Reusable pure implementation of filterByTimeframe matching src/routes/_authenticated/dashboard.developer.tsx
function filterItemsByTimeframe<T extends { created_at?: string; joined_at?: string }>(
  items: T[],
  timeframe: TimeframeOption,
  customDateRange?: CustomDateRange | null,
  referenceNow: number = Date.now(),
): T[] {
  if (timeframe === "ALL") return items;

  if (timeframe === "CUSTOM") {
    if (!customDateRange) return items;
    const startMs = customDateRange.start.getTime();
    const endMs = customDateRange.end.getTime();
    return items.filter((item) => {
      const dateStr = item.created_at || item.joined_at;
      if (!dateStr) return true;
      const t = new Date(dateStr).getTime();
      return t >= startMs && t <= endMs;
    });
  }

  const limits: Record<string, number> = {
    "1D": 24 * 60 * 60 * 1000,
    "7D": 7 * 24 * 60 * 60 * 1000,
    "30D": 30 * 24 * 60 * 60 * 1000,
  };
  const maxDiff = limits[timeframe] || Infinity;

  return items.filter((item) => {
    const dateStr = item.created_at || item.joined_at;
    if (!dateStr) return true;
    return referenceNow - new Date(dateStr).getTime() <= maxDiff;
  });
}

describe("Developer Portal: Custom Time Window & Calendar Filter", () => {
  const baseNow = new Date("2026-11-06T23:59:59.000Z").getTime();

  const mockSessions = [
    { id: "sess-1", title: "Morning Lecture", created_at: "2026-11-06T09:15:00.000Z" },
    { id: "sess-2", title: "Afternoon Lab", created_at: "2026-11-06T14:30:00.000Z" },
    { id: "sess-3", title: "Evening Workshop", created_at: "2026-11-06T18:45:00.000Z" },
    { id: "sess-4", title: "Yesterday Review", created_at: "2026-11-05T10:00:00.000Z" },
    { id: "sess-5", title: "Last Week Demo", created_at: "2026-10-31T11:00:00.000Z" },
    { id: "sess-6", title: "Last Month Keynote", created_at: "2026-10-15T08:00:00.000Z" },
    { id: "sess-7", title: "Old Session", created_at: "2026-08-01T10:00:00.000Z" },
  ];

  it("returns all items when timeframe is ALL", () => {
    const result = filterItemsByTimeframe(mockSessions, "ALL", null, baseNow);
    expect(result.length).toBe(mockSessions.length);
  });

  it("filters accurately for standard 1D preset (last 24 hours)", () => {
    // 24h prior to 2026-11-06T23:59:59Z is 2026-11-05T23:59:59Z
    const result = filterItemsByTimeframe(mockSessions, "1D", null, baseNow);
    expect(result.map((s) => s.id)).toEqual(["sess-1", "sess-2", "sess-3"]);
  });

  it("filters accurately for standard 7D preset (last 7 days)", () => {
    const result = filterItemsByTimeframe(mockSessions, "7D", null, baseNow);
    expect(result.map((s) => s.id)).toEqual(["sess-1", "sess-2", "sess-3", "sess-4", "sess-5"]);
  });

  it("filters accurately for custom single-day window (full day: 00:00:00 - 23:59:59)", () => {
    const customRange: CustomDateRange = {
      start: new Date("2026-11-06T00:00:00.000Z"),
      end: new Date("2026-11-06T23:59:59.999Z"),
      label: "Nov 6, 2026",
      hasCustomTime: false,
    };

    const result = filterItemsByTimeframe(mockSessions, "CUSTOM", customRange, baseNow);
    expect(result.map((s) => s.id)).toEqual(["sess-1", "sess-2", "sess-3"]);
  });

  it("filters accurately for custom multi-day range", () => {
    const customRange: CustomDateRange = {
      start: new Date("2026-10-30T00:00:00.000Z"),
      end: new Date("2026-11-05T23:59:59.999Z"),
      label: "Oct 30 - Nov 5, 2026",
      hasCustomTime: false,
    };

    const result = filterItemsByTimeframe(mockSessions, "CUSTOM", customRange, baseNow);
    expect(result.map((s) => s.id)).toEqual(["sess-4", "sess-5"]);
  });

  it("filters accurately with exact optional start and end time boundaries", () => {
    // Only items between 09:00 and 15:00 on Nov 6
    const customRangeWithTime: CustomDateRange = {
      start: new Date("2026-11-06T09:00:00.000Z"),
      end: new Date("2026-11-06T15:00:00.000Z"),
      startTime: "09:00",
      endTime: "15:00",
      hasCustomTime: true,
      label: "Nov 6, 2026 (09:00 - 15:00)",
    };

    const result = filterItemsByTimeframe(mockSessions, "CUSTOM", customRangeWithTime, baseNow);
    // sess-1 is 09:15, sess-2 is 14:30. sess-3 is 18:45 (excluded!).
    expect(result.map((s) => s.id)).toEqual(["sess-1", "sess-2"]);
  });

  it("correctly includes boundaries when timestamps match start or end exactly", () => {
    const customRange: CustomDateRange = {
      start: new Date("2026-11-06T09:15:00.000Z"),
      end: new Date("2026-11-06T14:30:00.000Z"),
      startTime: "09:15",
      endTime: "14:30",
      hasCustomTime: true,
      label: "Exact Boundaries",
    };

    const result = filterItemsByTimeframe(mockSessions, "CUSTOM", customRange, baseNow);
    expect(result.map((s) => s.id)).toEqual(["sess-1", "sess-2"]);
  });

  it("supports participant records using joined_at timestamp", () => {
    const mockParticipants = [
      { id: "p-1", student_id: "21CS01", joined_at: "2026-11-06T10:00:00.000Z" },
      { id: "p-2", student_id: "21CS02", joined_at: "2026-11-06T16:00:00.000Z" },
      { id: "p-3", student_id: "21CS03", joined_at: "2026-11-04T12:00:00.000Z" },
    ];

    const customRangeWithTime: CustomDateRange = {
      start: new Date("2026-11-06T08:00:00.000Z"),
      end: new Date("2026-11-06T12:00:00.000Z"),
      startTime: "08:00",
      endTime: "12:00",
      hasCustomTime: true,
      label: "Morning Joins",
    };

    const result = filterItemsByTimeframe(mockParticipants, "CUSTOM", customRangeWithTime, baseNow);
    expect(result.map((p) => p.id)).toEqual(["p-1"]);
  });

  it("gracefully falls back to all items if customDateRange is null when timeframe is CUSTOM", () => {
    const result = filterItemsByTimeframe(mockSessions, "CUSTOM", null, baseNow);
    expect(result.length).toBe(mockSessions.length);
  });
});
