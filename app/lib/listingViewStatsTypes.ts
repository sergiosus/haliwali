export type ListingViewStatsPayload = {
  total: number;
  today: number;
  last7Days: number;
  last30Days: number;
  uniqueViewers: number;
  cities: Array<{ city: string; views: number; share: number }>;
  daily: Array<{ date: string; views: number }>;
};
