/**
 * SCORM time parsing and formatting utilities.
 * Handles both SCORM 1.2 (HH:MM:SS[.SS]) and SCORM 2004 (ISO 8601 duration PT[#H][#M][#S]).
 */

/**
 * Parses SCORM 1.2 time format: "HHHH:MM:SS.SS" or "HH:MM:SS" into total seconds.
 */
export function parseScorm12Time(timeStr: string): number {
  if (!timeStr || typeof timeStr !== "string") return 0;
  const parts = timeStr.trim().split(":");
  if (parts.length !== 3) return 0;

  const hours = parseFloat(parts[0]) || 0;
  const minutes = parseFloat(parts[1]) || 0;
  const seconds = parseFloat(parts[2]) || 0;

  return Math.max(0, Math.round(hours * 3600 + minutes * 60 + seconds));
}

/**
 * Formats seconds into SCORM 1.2 format: "HH:MM:SS".
 */
export function formatScorm12Time(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds || 0));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;

  const hh = hours.toString().padStart(2, "0");
  const mm = minutes.toString().padStart(2, "0");
  const ss = seconds.toString().padStart(2, "0");

  return `${hh}:${mm}:${ss}`;
}

/**
 * Parses SCORM 2004 ISO 8601 duration (e.g. "PT1H30M15S", "PT45S", "P1DT2H") into total seconds.
 */
export function parseScorm2004Time(durationStr: string): number {
  if (!durationStr || typeof durationStr !== "string") return 0;
  const trimmed = durationStr.trim();

  // Basic ISO 8601 duration regex matching P...T[H][M][S]
  const regex = /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i;
  const match = trimmed.match(regex);
  if (!match) {
    // Fallback: check if standard HH:MM:SS was passed
    if (trimmed.includes(":")) {
      return parseScorm12Time(trimmed);
    }
    const num = parseFloat(trimmed);
    return isNaN(num) ? 0 : Math.max(0, Math.round(num));
  }

  const days = parseFloat(match[3] || "0");
  const hours = parseFloat(match[4] || "0");
  const minutes = parseFloat(match[5] || "0");
  const seconds = parseFloat(match[6] || "0");

  return Math.max(0, Math.round(days * 86400 + hours * 3600 + minutes * 60 + seconds));
}

/**
 * Formats seconds into SCORM 2004 ISO 8601 duration: "PT#H#M#S".
 */
export function formatScorm2004Time(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds || 0));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;

  return `PT${hours}H${minutes}M${seconds}S`;
}
