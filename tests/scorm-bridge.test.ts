import { describe, it, expect, vi } from "vitest";
import {
  parseScorm12Time,
  formatScorm12Time,
  parseScorm2004Time,
  formatScorm2004Time,
} from "../lib/scorm/time";
import { ScormBridge } from "../lib/scorm/bridge";

describe("SCORM Time Utilities", () => {
  it("parses and formats SCORM 1.2 time", () => {
    expect(parseScorm12Time("00:00:00")).toBe(0);
    expect(parseScorm12Time("01:30:15")).toBe(5415);
    expect(parseScorm12Time("00:05:30.50")).toBe(331);
    expect(formatScorm12Time(5415)).toBe("01:30:15");
    expect(formatScorm12Time(0)).toBe("00:00:00");
  });

  it("parses and formats SCORM 2004 ISO 8601 duration", () => {
    expect(parseScorm2004Time("PT0H0M0S")).toBe(0);
    expect(parseScorm2004Time("PT1H30M15S")).toBe(5415);
    expect(parseScorm2004Time("PT45S")).toBe(45);
    expect(formatScorm2004Time(5415)).toBe("PT1H30M15S");
  });
});

describe("SCORM 1.2 CMI Bridge", () => {
  it("initializes, sets, gets, and commits values correctly", () => {
    const onCommit = vi.fn();
    const bridge = new ScormBridge({
      version: "1.2",
      learnerId: "user_123",
      learnerName: "John Doe",
      initialState: {
        lessonStatus: "incomplete",
        location: "slide_2",
        suspendData: "state_data",
      },
      onCommit,
    });

    const api = bridge.getScorm12API();

    // Not initialized calls fail
    expect(api.LMSGetValue("cmi.core.student_id")).toBe("");
    expect(api.LMSGetLastError()).toBe("301");

    // Initialize
    expect(api.LMSInitialize("")).toBe("true");
    expect(api.LMSGetLastError()).toBe("0");

    // Double initialize fails
    expect(api.LMSInitialize("")).toBe("false");
    expect(api.LMSGetLastError()).toBe("101");

    // Initial state getters
    expect(api.LMSGetValue("cmi.core.student_id")).toBe("user_123");
    expect(api.LMSGetValue("cmi.core.student_name")).toBe("John Doe");
    expect(api.LMSGetValue("cmi.core.lesson_location")).toBe("slide_2");
    expect(api.LMSGetValue("cmi.core.lesson_status")).toBe("incomplete");
    expect(api.LMSGetValue("cmi.suspend_data")).toBe("state_data");

    // Read only checks
    expect(api.LMSSetValue("cmi.core.student_id", "hacker")).toBe("false");
    expect(api.LMSGetLastError()).toBe("403");

    // Set values
    expect(api.LMSSetValue("cmi.core.lesson_location", "slide_5")).toBe("true");
    expect(api.LMSSetValue("cmi.core.lesson_status", "passed")).toBe("true");
    expect(api.LMSSetValue("cmi.core.score.raw", "85")).toBe("true");
    expect(api.LMSSetValue("cmi.suspend_data", "new_state")).toBe("true");

    // Get updated values
    expect(api.LMSGetValue("cmi.core.lesson_location")).toBe("slide_5");
    expect(api.LMSGetValue("cmi.core.lesson_status")).toBe("passed");
    expect(api.LMSGetValue("cmi.core.score.raw")).toBe("85");

    // Commit
    expect(api.LMSCommit("")).toBe("true");
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(
      expect.objectContaining({
        lessonStatus: "passed",
        rawScore: 85,
        location: "slide_5",
        suspendData: "new_state",
      })
    );

    // Finish
    expect(api.LMSFinish("")).toBe("true");
    expect(api.LMSGetValue("cmi.core.lesson_location")).toBe("");
    expect(api.LMSGetLastError()).toBe("101");
  });
});

describe("SCORM 2004 CMI Bridge", () => {
  it("initializes, handles separate completion/success status, and commits", () => {
    const onCommit = vi.fn();
    const bridge = new ScormBridge({
      version: "2004",
      learnerId: "user_456",
      learnerName: "Jane Doe",
      initialState: {
        lessonStatus: "not_attempted",
      },
      onCommit,
    });

    const api = bridge.getScorm2004API();

    expect(api.Initialize("")).toBe("true");
    expect(api.GetValue("cmi.learner_id")).toBe("user_456");
    expect(api.GetValue("cmi.completion_status")).toBe("not attempted");

    // Update statuses
    expect(api.SetValue("cmi.completion_status", "completed")).toBe("true");
    expect(api.SetValue("cmi.success_status", "passed")).toBe("true");
    expect(api.SetValue("cmi.score.scaled", "0.95")).toBe("true");
    expect(api.SetValue("cmi.score.raw", "95")).toBe("true");
    expect(api.SetValue("cmi.location", "module_3")).toBe("true");

    expect(api.Commit("")).toBe("true");
    expect(onCommit).toHaveBeenCalledWith(
      expect.objectContaining({
        lessonStatus: "passed",
        scaledScore: 0.95,
        rawScore: 95,
        location: "module_3",
      })
    );

    expect(api.Terminate("")).toBe("true");
  });
});
