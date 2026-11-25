import { XMLParser } from "fast-xml-parser";

export type ScormVersion = "1.2" | "2004_2nd" | "2004_3rd" | "2004_4th";

export interface ScormManifestItem {
  identifier: string;
  title: string;
  identifierref?: string;
  parameters?: string;
  masteryScore?: number;
}

export interface ScormManifestResource {
  identifier: string;
  type: string;
  scormType: "sco" | "asset";
  href: string;
  files: string[];
}

export interface ParsedScormManifest {
  version: ScormVersion;
  title: string;
  launchPath: string;
  entryPoint: string;
  masteryScore?: number;
  items: ScormManifestItem[];
  resources: ScormManifestResource[];
  rawManifest?: Record<string, unknown>;
}

/**
 * Validates that a path is safe and strictly relative within the package.
 * Blocks Zip Slip, absolute paths, Windows drive letters, and dangerous schemes.
 */
export function isSafeRelativePath(path: string): boolean {
  if (!path || typeof path !== "string") return false;

  const trimmed = path.trim();
  if (!trimmed) return false;

  // Block null bytes
  if (trimmed.includes("\0")) return false;

  // Block leading slash / backslash or double slash protocol-relative URLs
  if (trimmed.startsWith("/") || trimmed.startsWith("\\") || trimmed.startsWith("//")) {
    return false;
  }

  // Block Windows drive paths (e.g. C:\)
  if (/^[a-zA-Z]:[/\\]/.test(trimmed)) return false;

  // Block dangerous or remote URI schemes
  if (/^(javascript|data|vbscript|http|https|ftp|file|blob):/i.test(trimmed)) {
    return false;
  }

  // Strip query/hash before checking path segments
  const pathOnly = trimmed.split(/[?#]/)[0];

  // Block traversal segments (.. or .\ or ./ or \..)
  const segments = pathOnly.split(/[/\\]/);
  for (const seg of segments) {
    if (seg === "..") return false;
  }

  return true;
}

/**
 * Normalizes an array or single value to an array.
 */
function toArray<T>(val: T | T[] | undefined): T[] {
  if (val === undefined || val === null) return [];
  return Array.isArray(val) ? val : [val];
}

/**
 * Parses SCORM 1.2 and SCORM 2004 imsmanifest.xml files.
 */
export function parseScormManifest(xmlContent: string): ParsedScormManifest {
  if (!xmlContent || typeof xmlContent !== "string") {
    throw new Error("Invalid or empty SCORM manifest XML");
  }

  // Defense-in-depth: reject XML external entity declarations (XXE)
  if (/<!ENTITY/i.test(xmlContent) || /SYSTEM\s+["']/i.test(xmlContent) || /PUBLIC\s+["']/i.test(xmlContent)) {
    throw new Error("Potential XXE vulnerability detected in XML manifest");
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    allowBooleanAttributes: true,
    parseAttributeValue: false,
    trimValues: true,
    removeNSPrefix: false,
  });

  let parsedObj: Record<string, unknown>;
  try {
    parsedObj = parser.parse(xmlContent);
  } catch (err) {
    throw new Error(`Failed to parse SCORM manifest XML: ${err instanceof Error ? err.message : String(err)}`);
  }

  const manifest = (parsedObj.manifest ||
    Object.entries(parsedObj).find(([k]) => k.endsWith(":manifest") || k === "manifest")?.[1]) as
    | Record<string, unknown>
    | undefined;

  if (!manifest || typeof manifest !== "object") {
    throw new Error("Invalid SCORM package: Missing root <manifest> element");
  }

  // 1. Determine SCORM Version
  const metadata = manifest.metadata as Record<string, unknown> | undefined;
  const schemaVersionRaw = (
    metadata?.schemaversion ||
    metadata?.["adlcp:schemaversion"] ||
    Object.entries(metadata || {}).find(([k]) => k.toLowerCase().includes("schemaversion"))?.[1]
  );
  const schemaVersionStr = typeof schemaVersionRaw === "string" ? schemaVersionRaw.trim() : "";

  let version: ScormVersion = "1.2";

  if (schemaVersionStr) {
    const vLower = schemaVersionStr.toLowerCase();
    if (vLower.includes("4th")) {
      version = "2004_4th";
    } else if (vLower.includes("3rd")) {
      version = "2004_3rd";
    } else if (vLower.includes("2nd") || vLower.includes("cam 1.3") || vLower.includes("2004")) {
      version = "2004_2nd";
    } else if (vLower.includes("1.2") || vLower.includes("1.1")) {
      version = "1.2";
    }
  } else {
    // Check manifest attributes/namespaces
    const rawManifestStr = JSON.stringify(manifest);
    if (rawManifestStr.includes("adlcp_v1p3") || rawManifestStr.includes("2004") || rawManifestStr.includes("imsss")) {
      version = "2004_3rd";
    } else {
      version = "1.2";
    }
  }

  // 2. Extract Resources
  const resourcesObj = manifest.resources as Record<string, unknown> | undefined;
  const rawResources = toArray(resourcesObj?.resource as Record<string, unknown> | Record<string, unknown>[]);
  const resources: ScormManifestResource[] = [];
  const resourceMap = new Map<string, ScormManifestResource>();

  for (const res of rawResources) {
    if (!res || typeof res !== "object") continue;
    const id = String(res["@_identifier"] || "");
    const type = String(res["@_type"] || "webcontent");
    const scormTypeRaw = String(res["@_adlcp:scormType"] || res["@_adlcp:scormtype"] || "sco").toLowerCase();
    const scormType = scormTypeRaw === "asset" ? "asset" : "sco";
    const href = String(res["@_href"] || "");

    const files = toArray(res.file as Record<string, unknown> | Record<string, unknown>[]).map((f) =>
      String(f?.["@_href"] || "")
    );

    const resourceItem: ScormManifestResource = {
      identifier: id,
      type,
      scormType,
      href,
      files,
    };

    if (id) {
      resources.push(resourceItem);
      resourceMap.set(id, resourceItem);
    }
  }

  // 3. Extract Organizations, Items, and Title
  const organizationsObj = manifest.organizations as Record<string, unknown> | undefined;
  const defaultOrgId = String(organizationsObj?.["@_default"] || "");
  const rawOrgs = toArray(organizationsObj?.organization as Record<string, unknown> | Record<string, unknown>[]);

  const targetOrg =
    rawOrgs.find((org) => org?.["@_identifier"] === defaultOrgId) || rawOrgs[0] || ({} as Record<string, unknown>);

  const title = String(targetOrg?.title || manifest["@_identifier"] || "SCORM Course");

  const items: ScormManifestItem[] = [];

  // Recursive item collector
  function collectItems(rawItemNodes: unknown) {
    for (const itemNode of toArray(rawItemNodes as Record<string, unknown> | Record<string, unknown>[])) {
      if (!itemNode || typeof itemNode !== "object") continue;

      const itemObj = itemNode as Record<string, unknown>;
      const identifier = String(itemObj["@_identifier"] || "");
      const itemTitle = String(itemObj.title || "Untitled Lesson");
      const identifierref = itemObj["@_identifierref"] ? String(itemObj["@_identifierref"]) : undefined;
      const parameters = itemObj["@_parameters"] ? String(itemObj["@_parameters"]) : undefined;

      // Extract masteryScore / minNormalizedMeasure
      let itemMasteryScore: number | undefined;
      const rawScore12 =
        itemObj["adlcp:masteryscore"] ||
        itemObj["masteryscore"] ||
        (itemObj as Record<string, unknown>)["@_adlcp:masteryscore"];

      if (rawScore12 !== undefined) {
        const parsed = Number(rawScore12);
        if (!Number.isNaN(parsed)) itemMasteryScore = parsed;
      } else {
        // Try SCORM 2004 sequencing/objectives/primaryObjective/minNormalizedMeasure
        const sequencing = (itemObj["imsss:sequencing"] || itemObj.sequencing) as Record<string, unknown> | undefined;
        const objectives = (sequencing?.["imsss:objectives"] || sequencing?.objectives) as Record<string, unknown> | undefined;
        const primaryObj = (objectives?.["imsss:primaryObjective"] || objectives?.primaryObjective) as
          | Record<string, unknown>
          | undefined;
        const rawMinMeasure = (primaryObj?.["imsss:minNormalizedMeasure"] || primaryObj?.minNormalizedMeasure);

        if (rawMinMeasure !== undefined) {
          const parsed = Number(rawMinMeasure);
          if (!Number.isNaN(parsed)) {
            // Normalized measure in SCORM 2004 is -1.0 to 1.0; standard mastery score is 0-100%
            itemMasteryScore = Math.round(parsed <= 1.0 ? parsed * 100 : parsed);
          }
        }
      }

      if (identifier) {
        items.push({
          identifier,
          title: itemTitle,
          identifierref,
          parameters,
          masteryScore: itemMasteryScore,
        });
      }

      // Children items
      if (itemObj.item) {
        collectItems(itemObj.item);
      }
    }
  }

  if (targetOrg?.item) {
    collectItems(targetOrg.item);
  }

  // 4. Resolve Launch Path and Mastery Score
  // Find first item that references a valid resource with href
  let launchPath = "";
  let masteryScore: number | undefined;

  for (const item of items) {
    if (item.identifierref && resourceMap.has(item.identifierref)) {
      const res = resourceMap.get(item.identifierref)!;
      if (res.href) {
        let path = res.href;
        const params = item.parameters || (res as unknown as Record<string, unknown>)["@_parameters"];
        if (params && typeof params === "string") {
          const sep = path.includes("?") ? "&" : (params.startsWith("?") || params.startsWith("#") ? "" : "?");
          path = `${path}${sep}${params}`;
        }
        launchPath = path;
        masteryScore = item.masteryScore;
        break;
      }
    }
  }

  // Fallback: If no item resolved launch path, pick first resource with href
  if (!launchPath) {
    const firstResWithHref = resources.find((r) => Boolean(r.href));
    if (firstResWithHref) {
      launchPath = firstResWithHref.href;
    }
  }

  if (!launchPath) {
    throw new Error("SCORM manifest does not specify a valid entrypoint launch file");
  }

  if (!isSafeRelativePath(launchPath)) {
    throw new Error(`Unsafe launch path detected in SCORM manifest: ${launchPath}`);
  }

  return {
    version,
    title,
    launchPath,
    entryPoint: launchPath,
    masteryScore,
    items,
    resources,
    rawManifest: manifest,
  };
}
