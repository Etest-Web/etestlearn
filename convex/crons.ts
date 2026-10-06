import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Daily check for learners with inactive courses (7+ days since last update)
crons.daily(
  "check-course-inactivity",
  { hourUTC: 8, minuteUTC: 0 },
  internal.enrollments.checkAllInactivityReminders,
);

export default crons;
