import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily("delete expired files", { hourUTC: 9, minuteUTC: 0 }, internal.cleanup.expired);

export default crons;
