/**
 * SCORM CMI Runtime Bridge.
 * Implements SCORM 1.2 (window.API) and SCORM 2004 (window.API_1484_11).
 */

import {
  parseScorm12Time,
  formatScorm12Time,
  parseScorm2004Time,
  formatScorm2004Time,
} from "./time";

export type NormalizedLessonStatus =
  | "passed"
  | "completed"
  | "failed"
  | "incomplete"
  | "browsed"
  | "not_attempted";

export interface ScormInitialState {
  lessonStatus?: NormalizedLessonStatus | string | null;
  rawScore?: number | null;
  minScore?: number | null;
  maxScore?: number | null;
  scaledScore?: number | null;
  location?: string | null;
  suspendData?: string | null;
  cmiState?: string | null;
  totalTimeSeconds?: number;
}

export interface ScormCommitPayload {
  lessonStatus?: NormalizedLessonStatus;
  rawScore?: number;
  minScore?: number;
  maxScore?: number;
  scaledScore?: number;
  location?: string;
  suspendData?: string;
  cmiState?: string;
  totalTimeSeconds?: number;
}

export interface ScormBridgeConfig {
  version: "1.2" | "2004";
  initialState?: ScormInitialState;
  learnerId?: string;
  learnerName?: string;
  masteryScore?: number | null;
  onCommit: (payload: ScormCommitPayload) => Promise<void> | void;
  onError?: (err: unknown) => void;
  debounceMs?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Error Code Constants
// ─────────────────────────────────────────────────────────────────────────────

const SCORM_12_ERRORS: Record<string, string> = {
  "0": "No error",
  "101": "General exception",
  "201": "Invalid argument error",
  "202": "Element cannot have children",
  "203": "Element not an array - cannot have count",
  "301": "Not initialized",
  "401": "Not implemented error",
  "402": "Invalid set value, element is a keyword",
  "403": "Element is read only",
  "404": "Element is write only",
  "405": "Incorrect Data Type",
};

const SCORM_2004_ERRORS: Record<string, string> = {
  "0": "No error",
  "101": "General exception",
  "102": "General Initialization Failure",
  "103": "Already Initialized",
  "111": "General Termination Failure",
  "112": "Termination Before Initialization",
  "113": "Termination After Termination",
  "122": "Retrieve Data Before Initialization",
  "123": "Retrieve Data After Termination",
  "132": "Store Data Before Initialization",
  "133": "Store Data After Termination",
  "142": "Commit Before Initialization",
  "143": "Commit After Termination",
  "201": "General Argument Error",
  "301": "General Get Failure",
  "351": "General Set Failure",
  "391": "General Commit Failure",
  "401": "Undefined Data Model Element",
  "402": "Unimplemented Data Model Element",
  "403": "Data Model Element Value Not Initialized",
  "404": "Data Model Element Is Read Only",
  "405": "Data Model Element Is Write Only",
  "406": "Data Model Element Type Mismatch",
};

// ─────────────────────────────────────────────────────────────────────────────
// ScormBridge implementation
// ─────────────────────────────────────────────────────────────────────────────

export class ScormBridge {
  private config: ScormBridgeConfig;
  private cmi: Record<string, string> = {};
  private initialized = false;
  private terminated = false;
  private lastError = "0";
  private dirty = false;
  private commitTimer: ReturnType<typeof setTimeout> | null = null;
  private totalTimeSeconds: number;
  private sessionStartTime: number | null = null;

  constructor(config: ScormBridgeConfig) {
    this.config = config;
    this.totalTimeSeconds = config.initialState?.totalTimeSeconds ?? 0;
    this.initializeCmiStore();
  }

  private initializeCmiStore() {
    const s = this.config.initialState;
    const v = this.config.version;

    // Load any saved CMI json state if present
    if (s?.cmiState) {
      try {
        const parsed = JSON.parse(s.cmiState);
        if (typeof parsed === "object" && parsed !== null) {
          for (const [k, val] of Object.entries(parsed)) {
            if (typeof val === "string") {
              this.cmi[k] = val;
            }
          }
        }
      } catch {
        // ignore JSON parse error in saved state
      }
    }

    if (v === "1.2") {
      this.cmi["cmi.core._children"] =
        "student_id,student_name,lesson_location,credit,lesson_status,entry,score,total_time,exit,session_time";
      this.cmi["cmi.core.student_id"] = this.config.learnerId ?? "learner";
      this.cmi["cmi.core.student_name"] = this.config.learnerName ?? "Learner";
      this.cmi["cmi.core.lesson_location"] = s?.location ?? "";
      this.cmi["cmi.core.credit"] = "credit";
      this.cmi["cmi.core.entry"] = s?.location ? "resume" : "ab-initio";
      this.cmi["cmi.core.lesson_mode"] = "normal";
      this.cmi["cmi.core.exit"] = "";
      this.cmi["cmi.core.session_time"] = "00:00:00";
      this.cmi["cmi.core.total_time"] = formatScorm12Time(this.totalTimeSeconds);

      // Score
      this.cmi["cmi.core.score._children"] = "raw,min,max";
      this.cmi["cmi.core.score.raw"] = s?.rawScore != null ? String(s.rawScore) : "";
      this.cmi["cmi.core.score.min"] = s?.minScore != null ? String(s.minScore) : "";
      this.cmi["cmi.core.score.max"] = s?.maxScore != null ? String(s.maxScore) : "";

      // Status: SCORM 1.2 uses "not attempted" with space
      const status = s?.lessonStatus ?? "not_attempted";
      this.cmi["cmi.core.lesson_status"] =
        status === "not_attempted" ? "not attempted" : status;

      this.cmi["cmi.suspend_data"] = s?.suspendData ?? "";
      if (this.config.masteryScore != null) {
        this.cmi["cmi.student_data.mastery_score"] = String(this.config.masteryScore);
      }
    } else {
      // SCORM 2004
      this.cmi["cmi._version"] = "1.0";
      this.cmi["cmi.learner_id"] = this.config.learnerId ?? "learner";
      this.cmi["cmi.learner_name"] = this.config.learnerName ?? "Learner";
      this.cmi["cmi.location"] = s?.location ?? "";
      this.cmi["cmi.credit"] = "credit";
      this.cmi["cmi.entry"] = s?.location ? "resume" : "ab-initio";
      this.cmi["cmi.mode"] = "normal";
      this.cmi["cmi.exit"] = "";
      this.cmi["cmi.session_time"] = "PT0H0M0S";
      this.cmi["cmi.total_time"] = formatScorm2004Time(this.totalTimeSeconds);

      // Score
      this.cmi["cmi.score._children"] = "raw,min,max,scaled";
      this.cmi["cmi.score.raw"] = s?.rawScore != null ? String(s.rawScore) : "";
      this.cmi["cmi.score.min"] = s?.minScore != null ? String(s.minScore) : "";
      this.cmi["cmi.score.max"] = s?.maxScore != null ? String(s.maxScore) : "";
      this.cmi["cmi.score.scaled"] = s?.scaledScore != null ? String(s.scaledScore) : "";

      // Status
      const status = s?.lessonStatus ?? "not_attempted";
      if (status === "passed" || status === "failed") {
        this.cmi["cmi.success_status"] = status;
        this.cmi["cmi.completion_status"] = "completed";
      } else if (status === "completed") {
        this.cmi["cmi.completion_status"] = "completed";
        this.cmi["cmi.success_status"] = "unknown";
      } else if (status === "incomplete") {
        this.cmi["cmi.completion_status"] = "incomplete";
        this.cmi["cmi.success_status"] = "unknown";
      } else {
        this.cmi["cmi.completion_status"] = "not attempted";
        this.cmi["cmi.success_status"] = "unknown";
      }

      this.cmi["cmi.suspend_data"] = s?.suspendData ?? "";
      if (this.config.masteryScore != null) {
        this.cmi["cmi.scaled_passing_score"] = String(this.config.masteryScore / 100);
      }
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // SCORM 1.2 Adapter Interface
  // ───────────────────────────────────────────────────────────────────────────

  public getScorm12API() {
    return {
      LMSInitialize: (param: string) => this.scorm12Initialize(param),
      LMSFinish: (param: string) => this.scorm12Finish(param),
      LMSGetValue: (element: string) => this.scorm12GetValue(element),
      LMSSetValue: (element: string, value: string) => this.scorm12SetValue(element, value),
      LMSCommit: (param: string) => this.scorm12Commit(param),
      LMSGetLastError: () => this.lastError,
      LMSGetErrorString: (errorCode: string) => SCORM_12_ERRORS[errorCode] ?? "Unknown error",
      LMSGetDiagnostic: (errorCode: string) => SCORM_12_ERRORS[errorCode] ?? "Unknown error",
    };
  }

  private scorm12Initialize(param: string): string {
    if (param !== "" && param !== null && param !== undefined) {
      this.lastError = "201";
      return "false";
    }
    if (this.initialized) {
      this.lastError = "101";
      return "false";
    }
    this.initialized = true;
    this.sessionStartTime = Date.now();
    this.lastError = "0";
    return "true";
  }

  private scorm12Finish(param: string): string {
    if (param !== "" && param !== null && param !== undefined) {
      this.lastError = "201";
      return "false";
    }
    if (!this.initialized) {
      this.lastError = "301";
      return "false";
    }
    if (this.terminated) {
      this.lastError = "101";
      return "false";
    }

    this.updateSessionDuration12();
    this.flush();
    this.terminated = true;
    this.lastError = "0";
    return "true";
  }

  private scorm12GetValue(element: string): string {
    if (!this.initialized) {
      this.lastError = "301";
      return "";
    }
    if (this.terminated) {
      this.lastError = "101";
      return "";
    }
    if (!element) {
      this.lastError = "201";
      return "";
    }

    this.lastError = "0";
    const val = this.cmi[element];
    return val !== undefined ? val : "";
  }

  private scorm12SetValue(element: string, value: string): string {
    if (!this.initialized) {
      this.lastError = "301";
      return "false";
    }
    if (this.terminated) {
      this.lastError = "101";
      return "false";
    }
    if (!element) {
      this.lastError = "201";
      return "false";
    }

    const readOnly = [
      "cmi.core._children",
      "cmi.core.student_id",
      "cmi.core.student_name",
      "cmi.core.credit",
      "cmi.core.entry",
      "cmi.core.total_time",
      "cmi.core.lesson_mode",
      "cmi.core.score._children",
    ];

    if (readOnly.includes(element)) {
      this.lastError = "403";
      return "false";
    }

    const strVal = String(value ?? "");
    this.cmi[element] = strVal;
    this.dirty = true;
    this.lastError = "0";

    if (element === "cmi.core.session_time") {
      const addedSeconds = parseScorm12Time(strVal);
      if (addedSeconds > 0) {
        this.totalTimeSeconds += addedSeconds;
        this.cmi["cmi.core.total_time"] = formatScorm12Time(this.totalTimeSeconds);
      }
    }

    this.scheduleDebouncedCommit();
    return "true";
  }

  private scorm12Commit(param: string): string {
    if (param !== "" && param !== null && param !== undefined) {
      this.lastError = "201";
      return "false";
    }
    if (!this.initialized) {
      this.lastError = "301";
      return "false";
    }
    if (this.terminated) {
      this.lastError = "101";
      return "false";
    }

    this.flush();
    this.lastError = "0";
    return "true";
  }

  private updateSessionDuration12() {
    if (this.sessionStartTime && !this.cmi["cmi.core.session_time"]) {
      const elapsed = Math.round((Date.now() - this.sessionStartTime) / 1000);
      if (elapsed > 0) {
        this.totalTimeSeconds += elapsed;
        this.cmi["cmi.core.total_time"] = formatScorm12Time(this.totalTimeSeconds);
      }
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // SCORM 2004 Adapter Interface
  // ───────────────────────────────────────────────────────────────────────────

  public getScorm2004API() {
    return {
      Initialize: (param: string) => this.scorm2004Initialize(param),
      Terminate: (param: string) => this.scorm2004Terminate(param),
      GetValue: (element: string) => this.scorm2004GetValue(element),
      SetValue: (element: string, value: string) => this.scorm2004SetValue(element, value),
      Commit: (param: string) => this.scorm2004Commit(param),
      GetLastError: () => this.lastError,
      GetErrorString: (errorCode: string) => SCORM_2004_ERRORS[errorCode] ?? "Unknown error",
      GetDiagnostic: (errorCode: string) => SCORM_2004_ERRORS[errorCode] ?? "Unknown error",
    };
  }

  private scorm2004Initialize(param: string): string {
    if (param !== "" && param !== null && param !== undefined) {
      this.lastError = "201";
      return "false";
    }
    if (this.initialized) {
      this.lastError = "103";
      return "false";
    }
    this.initialized = true;
    this.sessionStartTime = Date.now();
    this.lastError = "0";
    return "true";
  }

  private scorm2004Terminate(param: string): string {
    if (param !== "" && param !== null && param !== undefined) {
      this.lastError = "201";
      return "false";
    }
    if (!this.initialized) {
      this.lastError = "112";
      return "false";
    }
    if (this.terminated) {
      this.lastError = "113";
      return "false";
    }

    this.updateSessionDuration2004();
    this.flush();
    this.terminated = true;
    this.lastError = "0";
    return "true";
  }

  private scorm2004GetValue(element: string): string {
    if (!this.initialized) {
      this.lastError = "122";
      return "";
    }
    if (this.terminated) {
      this.lastError = "123";
      return "";
    }
    if (!element) {
      this.lastError = "201";
      return "";
    }

    this.lastError = "0";
    const val = this.cmi[element];
    return val !== undefined ? val : "";
  }

  private scorm2004SetValue(element: string, value: string): string {
    if (!this.initialized) {
      this.lastError = "132";
      return "false";
    }
    if (this.terminated) {
      this.lastError = "133";
      return "false";
    }
    if (!element) {
      this.lastError = "201";
      return "false";
    }

    const readOnly = [
      "cmi._version",
      "cmi.learner_id",
      "cmi.learner_name",
      "cmi.credit",
      "cmi.entry",
      "cmi.total_time",
      "cmi.mode",
      "cmi.scaled_passing_score",
    ];

    if (readOnly.includes(element)) {
      this.lastError = "404";
      return "false";
    }

    const strVal = String(value ?? "");
    this.cmi[element] = strVal;
    this.dirty = true;
    this.lastError = "0";

    if (element === "cmi.session_time") {
      const addedSeconds = parseScorm2004Time(strVal);
      if (addedSeconds > 0) {
        this.totalTimeSeconds += addedSeconds;
        this.cmi["cmi.total_time"] = formatScorm2004Time(this.totalTimeSeconds);
      }
    }

    this.scheduleDebouncedCommit();
    return "true";
  }

  private scorm2004Commit(param: string): string {
    if (param !== "" && param !== null && param !== undefined) {
      this.lastError = "201";
      return "false";
    }
    if (!this.initialized) {
      this.lastError = "142";
      return "false";
    }
    if (this.terminated) {
      this.lastError = "143";
      return "false";
    }

    this.flush();
    this.lastError = "0";
    return "true";
  }

  private updateSessionDuration2004() {
    if (this.sessionStartTime && !this.cmi["cmi.session_time"]) {
      const elapsed = Math.round((Date.now() - this.sessionStartTime) / 1000);
      if (elapsed > 0) {
        this.totalTimeSeconds += elapsed;
        this.cmi["cmi.total_time"] = formatScorm2004Time(this.totalTimeSeconds);
      }
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Commit and State Extraction
  // ───────────────────────────────────────────────────────────────────────────

  private scheduleDebouncedCommit() {
    const delay = this.config.debounceMs ?? 1500;
    if (this.commitTimer) {
      clearTimeout(this.commitTimer);
    }
    this.commitTimer = setTimeout(() => {
      this.flush();
    }, delay);
  }

  public getCommitPayload(): ScormCommitPayload {
    const v = this.config.version;
    let lessonStatus: NormalizedLessonStatus = "not_attempted";
    let rawScore: number | undefined;
    let minScore: number | undefined;
    let maxScore: number | undefined;
    let scaledScore: number | undefined;
    let location: string | undefined;
    let suspendData: string | undefined;

    if (v === "1.2") {
      const rawStatus = (this.cmi["cmi.core.lesson_status"] || "").trim().toLowerCase();
      if (rawStatus === "passed") lessonStatus = "passed";
      else if (rawStatus === "completed") lessonStatus = "completed";
      else if (rawStatus === "failed") lessonStatus = "failed";
      else if (rawStatus === "incomplete") lessonStatus = "incomplete";
      else if (rawStatus === "browsed") lessonStatus = "browsed";
      else lessonStatus = "not_attempted";

      const raw = parseFloat(this.cmi["cmi.core.score.raw"]);
      if (!isNaN(raw)) rawScore = raw;

      const min = parseFloat(this.cmi["cmi.core.score.min"]);
      if (!isNaN(min)) minScore = min;

      const max = parseFloat(this.cmi["cmi.core.score.max"]);
      if (!isNaN(max)) maxScore = max;

      location = this.cmi["cmi.core.lesson_location"] || undefined;
      suspendData = this.cmi["cmi.suspend_data"] || undefined;
    } else {
      // 2004
      const success = (this.cmi["cmi.success_status"] || "").trim().toLowerCase();
      const completion = (this.cmi["cmi.completion_status"] || "").trim().toLowerCase();

      if (success === "passed") lessonStatus = "passed";
      else if (completion === "completed") lessonStatus = "completed";
      else if (success === "failed") lessonStatus = "failed";
      else if (completion === "incomplete") lessonStatus = "incomplete";
      else if (completion === "not attempted") lessonStatus = "not_attempted";
      else lessonStatus = "not_attempted";

      const raw = parseFloat(this.cmi["cmi.score.raw"]);
      if (!isNaN(raw)) rawScore = raw;

      const min = parseFloat(this.cmi["cmi.score.min"]);
      if (!isNaN(min)) minScore = min;

      const max = parseFloat(this.cmi["cmi.score.max"]);
      if (!isNaN(max)) maxScore = max;

      const scaled = parseFloat(this.cmi["cmi.score.scaled"]);
      if (!isNaN(scaled)) scaledScore = scaled;

      location = this.cmi["cmi.location"] || undefined;
      suspendData = this.cmi["cmi.suspend_data"] || undefined;
    }

    return {
      lessonStatus,
      rawScore,
      minScore,
      maxScore,
      scaledScore,
      location,
      suspendData,
      cmiState: JSON.stringify(this.cmi),
      totalTimeSeconds: this.totalTimeSeconds,
    };
  }

  public flush() {
    if (this.commitTimer) {
      clearTimeout(this.commitTimer);
      this.commitTimer = null;
    }

    if (!this.dirty) return;
    this.dirty = false;

    const payload = this.getCommitPayload();
    try {
      const res = this.config.onCommit(payload);
      if (res instanceof Promise) {
        res.catch((err) => {
          this.dirty = true;
          this.config.onError?.(err);
        });
      }
    } catch (err) {
      this.dirty = true;
      this.config.onError?.(err);
    }
  }

  public destroy() {
    this.flush();
  }
}
