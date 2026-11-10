import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Daily check for learners with inactive courses (7+ days since last update)
crons.daily(
  "check-course-inactivity",
  { hourUTC: 8, minuteUTC: 0 },
  internal.enrollments.checkAllInactivityReminders,
);

// Hourly reconciliation of stale multipart uploads (Phase 5).
crons.interval(
  "cleanup-stale-video-uploads",
  { minutes: 60 },
  internal.videoStorage.cleanupStaleUploads,
  {},
);

// Daily retention sweep: a ready asset's raw source is kept for 30 days so
// its ladder can be rebuilt without another upload, then deleted.
crons.daily(
  "reap-video-raw-sources",
  { hourUTC: 3, minuteUTC: 0 },
  internal.videoStorage.reapRawSources,
  {},
);

export default crons;
