import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { extractScormArchive, sanitizeZipEntryPath } from "../lib/scorm/zip";

describe("sanitizeZipEntryPath", () => {
  it("cleans standard paths", () => {
    expect(sanitizeZipEntryPath("index.html")).toBe("index.html");
    expect(sanitizeZipEntryPath("assets/js/main.js")).toBe("assets/js/main.js");
    expect(sanitizeZipEntryPath("assets\\css\\style.css")).toBe("assets/css/style.css");
    expect(sanitizeZipEntryPath("./assets/image.png")).toBe("assets/image.png");
  });

  it("throws on Zip Slip attacks with parent directory traversal", () => {
    expect(() => sanitizeZipEntryPath("../evil.js")).toThrow(/Zip Slip/);
    expect(() => sanitizeZipEntryPath("foo/../../evil.js")).toThrow(/Zip Slip/);
    expect(() => sanitizeZipEntryPath("foo/../bar")).toThrow(/(Zip Slip|Directory traversal)/);
    expect(() => sanitizeZipEntryPath("/etc/passwd")).toThrow(/Zip Slip/);
    expect(() => sanitizeZipEntryPath("C:\\Windows\\system32")).toThrow(/Zip Slip/);
  });

  it("ignores directory entries", () => {
    expect(sanitizeZipEntryPath("folder/")).toBe("");
    expect(sanitizeZipEntryPath("folder\\subfolder\\")).toBe("");
  });
});

describe("extractScormArchive", () => {
  const sampleManifest = `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="MANIFEST_01" version="1.0">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>1.2</schemaversion>
  </metadata>
  <organizations default="ORG_01">
    <organization identifier="ORG_01">
      <title>Sample SCORM Course</title>
      <item identifier="ITEM_01" identifierref="RES_01">
        <title>Intro Lesson</title>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="RES_01" type="webcontent" adlcp:scormtype="sco" href="index.html">
      <file href="index.html" />
      <file href="style.css" />
    </resource>
  </resources>
</manifest>`;

  it("successfully unpacks a valid SCORM 1.2 zip archive", async () => {
    const zip = new JSZip();
    zip.file("imsmanifest.xml", sampleManifest);
    zip.file("index.html", "<!DOCTYPE html><html><body><h1>Hello SCORM</h1></body></html>");
    zip.file("style.css", "body { color: red; }");

    const zipBuffer = await zip.generateAsync({ type: "uint8array" });
    const result = await extractScormArchive(zipBuffer);

    expect(result.manifest.version).toBe("1.2");
    expect(result.manifest.title).toBe("Sample SCORM Course");
    expect(result.manifest.entryPoint).toBe("index.html");
    expect(result.files.length).toBe(3);

    const indexFile = result.files.find((f) => f.path === "index.html");
    expect(indexFile).toBeDefined();
    expect(indexFile?.contentType).toBe("text/html");

    const cssFile = result.files.find((f) => f.path === "style.css");
    expect(cssFile).toBeDefined();
    expect(cssFile?.contentType).toBe("text/css");
  });

  it("throws when imsmanifest.xml is missing", async () => {
    const zip = new JSZip();
    zip.file("index.html", "<h1>No manifest here</h1>");

    const zipBuffer = await zip.generateAsync({ type: "uint8array" });
    await expect(extractScormArchive(zipBuffer)).rejects.toThrow(
      /imsmanifest\.xml is missing/
    );
  });

  it("throws when entry point specified in manifest does not exist in zip", async () => {
    const zip = new JSZip();
    zip.file("imsmanifest.xml", sampleManifest);
    // Note: index.html is missing
    zip.file("style.css", "body { color: red; }");

    const zipBuffer = await zip.generateAsync({ type: "uint8array" });
    await expect(extractScormArchive(zipBuffer)).rejects.toThrow(
      /entry point "index\.html" specified in imsmanifest\.xml was not found/
    );
  });

  it("throws when zip contains Zip Slip traversal paths", async () => {
    const zip = new JSZip();
    zip.file("imsmanifest.xml", sampleManifest);
    zip.file("index.html", "<h1>Hello</h1>");
    zip.file("outside.txt", "evil payload");

    let zipBuffer = await zip.generateAsync({ type: "uint8array" });
    // Replace "outside.txt" (11 bytes) with "../evil.txt" (11 bytes) in the raw ZIP binary
    const searchBytes = new TextEncoder().encode("outside.txt");
    const replaceBytes = new TextEncoder().encode("../evil.txt");

    const modified = new Uint8Array(zipBuffer);
    for (let i = 0; i < modified.length - searchBytes.length; i++) {
      let match = true;
      for (let j = 0; j < searchBytes.length; j++) {
        if (modified[i + j] !== searchBytes[j]) {
          match = false;
          break;
        }
      }
      if (match) {
        modified.set(replaceBytes, i);
      }
    }

    await expect(extractScormArchive(modified)).rejects.toThrow(/(Zip Slip|Directory traversal)/);
  });
});
