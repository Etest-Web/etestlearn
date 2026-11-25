/**
 * The SCORM runtime that runs *inside* the package iframe.
 * ========================================================
 * SCORM packages are served from the Convex site origin, which is a different
 * origin from the app. That matters more than it looks: a SCO locates its LMS
 * by walking `window.parent` and reading `API` / `API_1484_11` off it, and
 * reading a property off a cross-origin window throws. The package would
 * therefore report "LMS not found" — the single failure that makes every module
 * unbootable — no matter how correct the app-side player is.
 *
 * So the LMS lives in the iframe, not the parent: this script is injected into
 * the `<head>` of every HTML document the package serves, defines the
 * synchronous CMI API locally, and forwards *commits* to the parent over
 * `postMessage`. The API has to stay synchronous (the spec says so and SCOs rely
 * on it), which is why reads and writes never cross the origin boundary: the
 * parent seeds a local mirror through the iframe URL fragment and only durable
 * saves are asynchronous.
 *
 * Everything below is one self-contained function, stringified and inlined. It
 * must not import, capture or reference anything from module scope — the
 * string is executed in a document that knows nothing about this bundle.
 */

export function scormBridgeMain(): void {
  var SOURCE = "glypha-scorm";
  var HASH_MARKER = "scormInit=";
  var STORE_KEY = "glyphaScormInit";

  // ── Seed ────────────────────────────────────────────────────────────────
  var init: Record<string, unknown> | null = null;
  var hash = String(location.hash || "");
  var at = hash.indexOf(HASH_MARKER);
  var fromHash = false;
  if (at !== -1) {
    try {
      init = JSON.parse(decodeURIComponent(hash.slice(at + HASH_MARKER.length)));
      fromHash = Boolean(init);
    } catch (e) {
      init = null;
    }
  }

  // A package that navigates to another one of its own documents arrives with
  // no fragment, so the seed is cached for the tab. That cache is also what
  // lets a resumed session survive an internal `window.location` jump.
  try {
    if (fromHash && init) {
      sessionStorage.setItem(STORE_KEY, JSON.stringify(init));
    } else if (!init) {
      var saved = sessionStorage.getItem(STORE_KEY);
      if (saved) init = JSON.parse(saved);
    }
  } catch (e) {
    /* storage disabled — the fragment alone is enough */
  }

  if (!init) init = {};

  var is12 = init.v === "1.2";
  var cmi: Record<string, string> = {};
  var totalTimeSeconds = typeof init.t === "number" ? init.t : 0;
  var masteryScore = typeof init.m === "number" ? init.m : null;
  var initialized = false;
  var terminated = false;
  var lastError = "0";
  var dirty = false;
  var commitTimer: ReturnType<typeof setTimeout> | null = null;
  var sessionStart = 0;

  if (typeof init.s === "string" && init.s) {
    try {
      var seeded = JSON.parse(init.s);
      for (var key in seeded) {
        if (Object.prototype.hasOwnProperty.call(seeded, key) && typeof seeded[key] === "string") {
          cmi[key] = seeded[key];
        }
      }
    } catch (e) {
      /* corrupt snapshot — fall through to defaults */
    }
  }

  function pad(n: number): string {
    return n < 10 ? "0" + n : String(n);
  }

  function format12(seconds: number): string {
    var s = Math.max(0, Math.floor(seconds || 0));
    return pad(Math.floor(s / 3600)) + ":" + pad(Math.floor((s % 3600) / 60)) + ":" + pad(s % 60);
  }

  function format2004(seconds: number): string {
    var s = Math.max(0, Math.floor(seconds || 0));
    return "PT" + Math.floor(s / 3600) + "H" + Math.floor((s % 3600) / 60) + "M" + (s % 60) + "S";
  }

  function parseDuration(value: string): number {
    if (!value) return 0;
    var trimmed = String(value).trim();
    if (trimmed.indexOf(":") !== -1) {
      var parts = trimmed.split(":");
      if (parts.length !== 3) return 0;
      return Math.max(
        0,
        Math.round(
          (parseFloat(parts[0]) || 0) * 3600 +
            (parseFloat(parts[1]) || 0) * 60 +
            (parseFloat(parts[2]) || 0)
        )
      );
    }
    var match = trimmed.match(
      /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i
    );
    if (!match) {
      var n = parseFloat(trimmed);
      return isNaN(n) ? 0 : Math.max(0, Math.round(n));
    }
    return Math.max(
      0,
      Math.round(
        (parseFloat(match[3] || "0") || 0) * 86400 +
          (parseFloat(match[4] || "0") || 0) * 3600 +
          (parseFloat(match[5] || "0") || 0) * 60 +
          (parseFloat(match[6] || "0") || 0)
      )
    );
  }

  function seedDefaults(): void {
    if (is12) {
      cmi["cmi.core._children"] =
        "student_id,student_name,lesson_location,credit,lesson_status,entry,score,total_time,exit,session_time";
      cmi["cmi.core.student_id"] = typeof init!.id === "string" ? (init!.id as string) : "learner";
      cmi["cmi.core.student_name"] = typeof init!.n === "string" ? (init!.n as string) : "Learner";
      cmi["cmi.core.lesson_location"] = cmi["cmi.core.lesson_location"] || "";
      cmi["cmi.core.credit"] = "credit";
      cmi["cmi.core.entry"] = cmi["cmi.core.lesson_location"] ? "resume" : "ab-initio";
      cmi["cmi.core.lesson_mode"] = "normal";
      cmi["cmi.core.exit"] = cmi["cmi.core.exit"] || "";
      cmi["cmi.core.session_time"] = "00:00:00";
      cmi["cmi.core.total_time"] = format12(totalTimeSeconds);
      cmi["cmi.core.score._children"] = "raw,min,max";
      cmi["cmi.core.score.raw"] = cmi["cmi.core.score.raw"] || "";
      cmi["cmi.core.score.min"] = cmi["cmi.core.score.min"] || "";
      cmi["cmi.core.score.max"] = cmi["cmi.core.score.max"] || "";
      var status = cmi["cmi.core.lesson_status"] || "not attempted";
      cmi["cmi.core.lesson_status"] = status;
      cmi["cmi.suspend_data"] = cmi["cmi.suspend_data"] || "";
      if (masteryScore !== null) cmi["cmi.student_data.mastery_score"] = String(masteryScore);
    } else {
      cmi["cmi._version"] = "1.0";
      cmi["cmi.learner_id"] = typeof init!.id === "string" ? (init!.id as string) : "learner";
      cmi["cmi.learner_name"] = typeof init!.n === "string" ? (init!.n as string) : "Learner";
      cmi["cmi.location"] = cmi["cmi.location"] || "";
      cmi["cmi.credit"] = "credit";
      cmi["cmi.entry"] = cmi["cmi.location"] ? "resume" : "ab-initio";
      cmi["cmi.mode"] = "normal";
      cmi["cmi.exit"] = cmi["cmi.exit"] || "";
      cmi["cmi.session_time"] = "PT0H0M0S";
      cmi["cmi.total_time"] = format2004(totalTimeSeconds);
      cmi["cmi.score._children"] = "raw,min,max,scaled";
      cmi["cmi.score.raw"] = cmi["cmi.score.raw"] || "";
      cmi["cmi.score.min"] = cmi["cmi.score.min"] || "";
      cmi["cmi.score.max"] = cmi["cmi.score.max"] || "";
      cmi["cmi.score.scaled"] = cmi["cmi.score.scaled"] || "";
      cmi["cmi.completion_status"] = cmi["cmi.completion_status"] || "not attempted";
      cmi["cmi.success_status"] = cmi["cmi.success_status"] || "unknown";
      cmi["cmi.suspend_data"] = cmi["cmi.suspend_data"] || "";
      if (masteryScore !== null) cmi["cmi.scaled_passing_score"] = String(masteryScore / 100);
    }
  }

  seedDefaults();

  // ── Parent channel ──────────────────────────────────────────────────────
  function post(message: Record<string, unknown>): void {
    try {
      parent.postMessage(message, "*");
    } catch (e) {
      /* parent gone */
    }
  }

  function errorText(code: string): string {
    var scorm12: Record<string, string> = {
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
    var scorm2004: Record<string, string> = {
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
    var table = is12 ? scorm12 : scorm2004;
    return table[code] || "Unknown error";
  }

  function buildPayload(): Record<string, unknown> {
    var lessonStatus = "not_attempted";
    var rawScore: number | undefined;
    var minScore: number | undefined;
    var maxScore: number | undefined;
    var scaledScore: number | undefined;
    var location: string | undefined;
    var suspendData: string | undefined;

    function num(value: string | undefined): number | undefined {
      var parsed = parseFloat(value || "");
      return isNaN(parsed) ? undefined : parsed;
    }

    if (is12) {
      var rawStatus = (cmi["cmi.core.lesson_status"] || "").trim().toLowerCase();
      if (rawStatus === "passed") lessonStatus = "passed";
      else if (rawStatus === "completed") lessonStatus = "completed";
      else if (rawStatus === "failed") lessonStatus = "failed";
      else if (rawStatus === "incomplete") lessonStatus = "incomplete";
      else if (rawStatus === "browsed") lessonStatus = "browsed";

      rawScore = num(cmi["cmi.core.score.raw"]);
      minScore = num(cmi["cmi.core.score.min"]);
      maxScore = num(cmi["cmi.core.score.max"]);
      location = cmi["cmi.core.lesson_location"] || undefined;
      suspendData = cmi["cmi.suspend_data"] || undefined;
    } else {
      var success = (cmi["cmi.success_status"] || "").trim().toLowerCase();
      var completion = (cmi["cmi.completion_status"] || "").trim().toLowerCase();
      if (success === "passed") lessonStatus = "passed";
      else if (completion === "completed") lessonStatus = "completed";
      else if (success === "failed") lessonStatus = "failed";
      else if (completion === "incomplete") lessonStatus = "incomplete";

      rawScore = num(cmi["cmi.score.raw"]);
      minScore = num(cmi["cmi.score.min"]);
      maxScore = num(cmi["cmi.score.max"]);
      scaledScore = num(cmi["cmi.score.scaled"]);
      location = cmi["cmi.location"] || undefined;
      suspendData = cmi["cmi.suspend_data"] || undefined;
    }

    return {
      lessonStatus: lessonStatus,
      rawScore: rawScore,
      minScore: minScore,
      maxScore: maxScore,
      scaledScore: scaledScore,
      location: location,
      suspendData: suspendData,
      cmiState: JSON.stringify(cmi),
      totalTimeSeconds: totalTimeSeconds,
    };
  }

  function flush(): void {
    if (commitTimer !== null) {
      clearTimeout(commitTimer);
      commitTimer = null;
    }
    if (!dirty) return;
    dirty = false;
    try {
      post({ source: SOURCE, type: "commit", payload: buildPayload() });
    } catch (e) {
      dirty = true;
    }
  }

  function schedule(): void {
    if (commitTimer !== null) clearTimeout(commitTimer);
    commitTimer = setTimeout(flush, 1500);
  }

  function addSessionTime(seconds: number): void {
    if (seconds <= 0) return;
    totalTimeSeconds += seconds;
    if (is12) cmi["cmi.core.total_time"] = format12(totalTimeSeconds);
    else cmi["cmi.total_time"] = format2004(totalTimeSeconds);
  }

  /** Elapsed wall-clock is added when the SCO never tracked session_time itself. */
  function accountForElapsed(): void {
    if (!sessionStart) return;
    var key = is12 ? "cmi.core.session_time" : "cmi.session_time";
    var selfTimed = parseDuration(cmi[key] || "") > 0;
    if (selfTimed) return;
    addSessionTime(Math.round((Date.now() - sessionStart) / 1000));
  }

  // ── SCORM 1.2 ───────────────────────────────────────────────────────────
  var API12 = {
    LMSInitialize: function (param: string) {
      if (param) {
        lastError = "201";
        return "false";
      }
      if (initialized) {
        lastError = "101";
        return "false";
      }
      initialized = true;
      sessionStart = Date.now();
      lastError = "0";
      post({ source: SOURCE, type: "ready", version: "1.2" });
      return "true";
    },
    LMSFinish: function (param: string) {
      if (param) {
        lastError = "201";
        return "false";
      }
      if (!initialized) {
        lastError = "301";
        return "false";
      }
      if (terminated) {
        lastError = "101";
        return "false";
      }
      accountForElapsed();
      flush();
      terminated = true;
      lastError = "0";
      post({ source: SOURCE, type: "finished", version: "1.2" });
      return "true";
    },
    LMSGetValue: function (element: string) {
      if (!initialized) {
        lastError = "301";
        return "";
      }
      if (terminated) {
        lastError = "101";
        return "";
      }
      if (!element) {
        lastError = "201";
        return "";
      }
      lastError = "0";
      return cmi[element] !== undefined ? cmi[element] : "";
    },
    LMSSetValue: function (element: string, value: string) {
      if (!initialized) {
        lastError = "301";
        return "false";
      }
      if (terminated) {
        lastError = "101";
        return "false";
      }
      if (!element) {
        lastError = "201";
        return "false";
      }
      var readOnly = [
        "cmi.core._children",
        "cmi.core.student_id",
        "cmi.core.student_name",
        "cmi.core.credit",
        "cmi.core.entry",
        "cmi.core.total_time",
        "cmi.core.lesson_mode",
        "cmi.core.score._children",
      ];
      if (readOnly.indexOf(element) !== -1) {
        lastError = "403";
        return "false";
      }
      var strValue = value === null || value === undefined ? "" : String(value);
      if (element === "cmi.core.session_time") addSessionTime(parseDuration(strValue));
      cmi[element] = strValue;
      dirty = true;
      lastError = "0";
      schedule();
      return "true";
    },
    LMSCommit: function (param: string) {
      if (param) {
        lastError = "201";
        return "false";
      }
      if (!initialized) {
        lastError = "301";
        return "false";
      }
      if (terminated) {
        lastError = "101";
        return "false";
      }
      flush();
      lastError = "0";
      return "true";
    },
    LMSGetLastError: function () {
      return lastError;
    },
    LMSGetErrorString: function (code: string) {
      return errorText(code);
    },
    LMSGetDiagnostic: function (code: string) {
      return errorText(code);
    },
  };

  // ── SCORM 2004 ──────────────────────────────────────────────────────────
  var API2004 = {
    Initialize: function (param: string) {
      if (param) {
        lastError = "201";
        return "false";
      }
      if (initialized) {
        lastError = "103";
        return "false";
      }
      initialized = true;
      sessionStart = Date.now();
      lastError = "0";
      post({ source: SOURCE, type: "ready", version: "2004" });
      return "true";
    },
    Terminate: function (param: string) {
      if (param) {
        lastError = "201";
        return "false";
      }
      if (!initialized) {
        lastError = "112";
        return "false";
      }
      if (terminated) {
        lastError = "113";
        return "false";
      }
      accountForElapsed();
      flush();
      terminated = true;
      lastError = "0";
      post({ source: SOURCE, type: "finished", version: "2004" });
      return "true";
    },
    GetValue: function (element: string) {
      if (!initialized) {
        lastError = "122";
        return "";
      }
      if (terminated) {
        lastError = "123";
        return "";
      }
      if (!element) {
        lastError = "201";
        return "";
      }
      lastError = "0";
      return cmi[element] !== undefined ? cmi[element] : "";
    },
    SetValue: function (element: string, value: string) {
      if (!initialized) {
        lastError = "132";
        return "false";
      }
      if (terminated) {
        lastError = "133";
        return "false";
      }
      if (!element) {
        lastError = "201";
        return "false";
      }
      var readOnly = [
        "cmi._version",
        "cmi.learner_id",
        "cmi.learner_name",
        "cmi.credit",
        "cmi.entry",
        "cmi.total_time",
        "cmi.mode",
        "cmi.scaled_passing_score",
      ];
      if (readOnly.indexOf(element) !== -1) {
        lastError = "404";
        return "false";
      }
      var strValue = value === null || value === undefined ? "" : String(value);
      if (element === "cmi.session_time") addSessionTime(parseDuration(strValue));
      cmi[element] = strValue;
      dirty = true;
      lastError = "0";
      schedule();
      return "true";
    },
    Commit: function (param: string) {
      if (param) {
        lastError = "201";
        return "false";
      }
      if (!initialized) {
        lastError = "142";
        return "false";
      }
      if (terminated) {
        lastError = "143";
        return "false";
      }
      flush();
      lastError = "0";
      return "true";
    },
    GetLastError: function () {
      return lastError;
    },
    GetErrorString: function (code: string) {
      return errorText(code);
    },
    GetDiagnostic: function (code: string) {
      return errorText(code);
    },
  };

  var target = window as unknown as Record<string, unknown>;
  if (is12) {
    target.API = API12;
    target.API_1484_11 = undefined;
  } else {
    target.API_1484_11 = API2004;
    target.API = undefined;
  }

  // A commit still sitting on the debounce when the frame is torn down is the
  // common shape of "my score disappeared".
  window.addEventListener("pagehide", flush);
  window.addEventListener("beforeunload", flush);

  function notifyParent(): void {
    post({
      source: SOURCE,
      type: "init",
      version: is12 ? "1.2" : "2004",
      title: document.title || "",
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", notifyParent);
  } else {
    notifyParent();
  }
}

/** The `<script>` payload injected into every package HTML document. */
export function scormBridgeSource(): string {
  return "(" + scormBridgeMain.toString() + ")();";
}

/**
 * Injects the bridge as the first script in `<head>` so it runs before any SCO
 * code that might probe for the LMS.
 */
export function injectScormBridge(html: string, source: string = scormBridgeSource()): string {
  const tag = `<script data-glypha-scorm="bridge">${source}</script>`;
  const head = /<head[^>]*>/i.exec(html);
  if (head && head.index !== undefined) {
    const insertAt = head.index + head[0].length;
    return html.slice(0, insertAt) + tag + html.slice(insertAt);
  }
  const htmlTag = /<html[^>]*>/i.exec(html);
  if (htmlTag && htmlTag.index !== undefined) {
    const insertAt = htmlTag.index + htmlTag[0].length;
    return html.slice(0, insertAt) + tag + html.slice(insertAt);
  }
  return tag + html;
}
