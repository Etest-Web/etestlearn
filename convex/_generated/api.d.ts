/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as announcements from "../announcements.js";
import type * as auditLogs from "../auditLogs.js";
import type * as bankVerification from "../bankVerification.js";
import type * as categories from "../categories.js";
import type * as certificateArtifacts from "../certificateArtifacts.js";
import type * as certificateTemplateActions from "../certificateTemplateActions.js";
import type * as certificateTemplates from "../certificateTemplates.js";
import type * as certificates from "../certificates.js";
import type * as courseAnnouncements from "../courseAnnouncements.js";
import type * as coupons from "../coupons.js";
import type * as courses from "../courses.js";
import type * as crons from "../crons.js";
import type * as discussions from "../discussions.js";
import type * as emailCampaigns from "../emailCampaigns.js";
import type * as emailCampaignsData from "../emailCampaignsData.js";
import type * as emailDeliveries from "../emailDeliveries.js";
import type * as enrollments from "../enrollments.js";
import type * as files from "../files.js";
import type * as friends from "../friends.js";
import type * as goals from "../goals.js";
import type * as groups from "../groups.js";
import type * as helpers_audit from "../helpers/audit.js";
import type * as helpers_auth from "../helpers/auth.js";
import type * as helpers_certificateTemplate from "../helpers/certificateTemplate.js";
import type * as helpers_completion from "../helpers/completion.js";
import type * as helpers_couponPricing from "../helpers/couponPricing.js";
import type * as helpers_encryption from "../helpers/encryption.js";
import type * as helpers_notifications from "../helpers/notifications.js";
import type * as helpers_rateLimit from "../helpers/rateLimit.js";
import type * as http from "../http.js";
import type * as inbox from "../inbox.js";
import type * as instructorApplications from "../instructorApplications.js";
import type * as instructorBank from "../instructorBank.js";
import type * as instructorStats from "../instructorStats.js";
import type * as instructors from "../instructors.js";
import type * as maintenance from "../maintenance.js";
import type * as payments from "../payments.js";
import type * as payouts from "../payouts.js";
import type * as paystack from "../paystack.js";
import type * as quizzes from "../quizzes.js";
import type * as rateLimit from "../rateLimit.js";
import type * as referrals from "../referrals.js";
import type * as reviews from "../reviews.js";
import type * as skills from "../skills.js";
import type * as statistics from "../statistics.js";
import type * as tasks from "../tasks.js";
import type * as tutorial from "../tutorial.js";
import type * as users from "../users.js";
import type * as videoAssets from "../videoAssets.js";
import type * as videoTranscode from "../videoTranscode.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  announcements: typeof announcements;
  auditLogs: typeof auditLogs;
  bankVerification: typeof bankVerification;
  categories: typeof categories;
  certificateArtifacts: typeof certificateArtifacts;
  certificateTemplateActions: typeof certificateTemplateActions;
  certificateTemplates: typeof certificateTemplates;
  certificates: typeof certificates;
  courseAnnouncements: typeof courseAnnouncements;
  coupons: typeof coupons;
  courses: typeof courses;
  crons: typeof crons;
  discussions: typeof discussions;
  emailCampaigns: typeof emailCampaigns;
  emailCampaignsData: typeof emailCampaignsData;
  emailDeliveries: typeof emailDeliveries;
  enrollments: typeof enrollments;
  files: typeof files;
  friends: typeof friends;
  goals: typeof goals;
  groups: typeof groups;
  "helpers/audit": typeof helpers_audit;
  "helpers/auth": typeof helpers_auth;
  "helpers/certificateTemplate": typeof helpers_certificateTemplate;
  "helpers/completion": typeof helpers_completion;
  "helpers/couponPricing": typeof helpers_couponPricing;
  "helpers/encryption": typeof helpers_encryption;
  "helpers/notifications": typeof helpers_notifications;
  "helpers/rateLimit": typeof helpers_rateLimit;
  http: typeof http;
  inbox: typeof inbox;
  instructorApplications: typeof instructorApplications;
  instructorBank: typeof instructorBank;
  instructorStats: typeof instructorStats;
  instructors: typeof instructors;
  maintenance: typeof maintenance;
  payments: typeof payments;
  payouts: typeof payouts;
  paystack: typeof paystack;
  quizzes: typeof quizzes;
  rateLimit: typeof rateLimit;
  referrals: typeof referrals;
  reviews: typeof reviews;
  skills: typeof skills;
  statistics: typeof statistics;
  tasks: typeof tasks;
  tutorial: typeof tutorial;
  users: typeof users;
  videoAssets: typeof videoAssets;
  videoTranscode: typeof videoTranscode;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
