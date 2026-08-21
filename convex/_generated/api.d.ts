/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as certificates from "../certificates.js";
import type * as courses from "../courses.js";
import type * as discussions from "../discussions.js";
import type * as enrollments from "../enrollments.js";
import type * as files from "../files.js";
import type * as http from "../http.js";
import type * as instructorApplications from "../instructorApplications.js";
import type * as payments from "../payments.js";
import type * as paystack from "../paystack.js";
import type * as quizzes from "../quizzes.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  certificates: typeof certificates;
  courses: typeof courses;
  discussions: typeof discussions;
  enrollments: typeof enrollments;
  files: typeof files;
  http: typeof http;
  instructorApplications: typeof instructorApplications;
  payments: typeof payments;
  paystack: typeof paystack;
  quizzes: typeof quizzes;
  users: typeof users;
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
