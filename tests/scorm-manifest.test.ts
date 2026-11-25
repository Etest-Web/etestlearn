import { describe, expect, it } from "vitest";
import { parseScormManifest, isSafeRelativePath } from "@/lib/scorm/manifest";

describe("isSafeRelativePath", () => {
  it("accepts safe relative paths", () => {
    expect(isSafeRelativePath("index.html")).toBe(true);
    expect(isSafeRelativePath("content/module1/index.html")).toBe(true);
    expect(isSafeRelativePath("course_files/data/launch.htm?id=123")).toBe(true);
  });

  it("rejects path traversal attempts", () => {
    expect(isSafeRelativePath("../index.html")).toBe(false);
    expect(isSafeRelativePath("content/../../index.html")).toBe(false);
    expect(isSafeRelativePath("..\\index.html")).toBe(false);
  });

  it("rejects absolute paths", () => {
    expect(isSafeRelativePath("/index.html")).toBe(false);
    expect(isSafeRelativePath("/etc/passwd")).toBe(false);
    expect(isSafeRelativePath("C:\\Windows\\system32")).toBe(false);
  });

  it("rejects dangerous URI schemes", () => {
    expect(isSafeRelativePath("javascript:alert(1)")).toBe(false);
    expect(isSafeRelativePath("data:text/html,<script>alert(1)</script>")).toBe(false);
    expect(isSafeRelativePath("http://evil.com/launch.html")).toBe(false);
    expect(isSafeRelativePath("https://evil.com/launch.html")).toBe(false);
    expect(isSafeRelativePath("//evil.com/launch.html")).toBe(false);
  });
});

describe("parseScormManifest", () => {
  const scorm12Xml = `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="com.scorm.golfsamples.contentpackaging.singlesco.12" version="1.0"
          xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
          xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>1.2</schemaversion>
  </metadata>
  <organizations default="golf_sample_default_org">
    <organization identifier="golf_sample_default_org">
      <title>Golf Explained - Single SCO</title>
      <item identifier="item_1" identifierref="resource_1">
        <title>Playing Golf</title>
        <adlcp:masteryscore>80</adlcp:masteryscore>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="resource_1" type="webcontent" adlcp:scormtype="sco" href="shared/launchpage.html">
      <file href="shared/launchpage.html"/>
      <file href="Playing/Playing.html"/>
    </resource>
  </resources>
</manifest>`;

  const scorm2004Xml = `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="com.scorm.golfsamples.contentpackaging.singlesco.2004" version="1.0"
          xmlns="http://www.imsglobal.org/xsd/imscp_v1p1"
          xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_v1p3"
          xmlns:imsss="http://www.imsglobal.org/xsd/imsss">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>2004 3rd Edition</schemaversion>
  </metadata>
  <organizations default="org_1">
    <organization identifier="org_1">
      <title>Golf 2004 Course</title>
      <item identifier="item_1" identifierref="res_1">
        <title>Introduction to Golf</title>
        <imsss:sequencing>
          <imsss:objectives>
            <imsss:primaryObjective satisfiedByMeasure="true">
              <imsss:minNormalizedMeasure>0.75</imsss:minNormalizedMeasure>
            </imsss:primaryObjective>
          </imsss:objectives>
        </imsss:sequencing>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="res_1" type="webcontent" adlcp:scormType="sco" href="index.html">
      <file href="index.html"/>
    </resource>
  </resources>
</manifest>`;

  it("correctly parses SCORM 1.2 manifest with launch path and mastery score", () => {
    const parsed = parseScormManifest(scorm12Xml);
    expect(parsed.version).toBe("1.2");
    expect(parsed.title).toBe("Golf Explained - Single SCO");
    expect(parsed.launchPath).toBe("shared/launchpage.html");
    expect(parsed.masteryScore).toBe(80);
    expect(parsed.items.length).toBe(1);
    expect(parsed.items[0].identifier).toBe("item_1");
    expect(parsed.resources.length).toBe(1);
    expect(parsed.resources[0].scormType).toBe("sco");
  });

  it("correctly parses SCORM 2004 3rd Edition manifest and converts normalized measure to mastery score", () => {
    const parsed = parseScormManifest(scorm2004Xml);
    expect(parsed.version).toBe("2004_3rd");
    expect(parsed.title).toBe("Golf 2004 Course");
    expect(parsed.launchPath).toBe("index.html");
    expect(parsed.masteryScore).toBe(75);
    expect(parsed.items.length).toBe(1);
  });

  it("handles SCORM 2004 4th Edition and 2nd Edition version strings", () => {
    const xml4th = scorm2004Xml.replace("2004 3rd Edition", "2004 4th Edition");
    expect(parseScormManifest(xml4th).version).toBe("2004_4th");

    const xml2nd = scorm2004Xml.replace("2004 3rd Edition", "2004 2nd Edition");
    expect(parseScormManifest(xml2nd).version).toBe("2004_2nd");

    const xmlCam = scorm2004Xml.replace("2004 3rd Edition", "CAM 1.3");
    expect(parseScormManifest(xmlCam).version).toBe("2004_2nd");
  });

  it("infers version from xml namespace when schemaversion tag is absent", () => {
    const noVersionXml = `<?xml version="1.0" encoding="UTF-8"?>
<manifest xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2" xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2">
  <organizations default="org">
    <organization identifier="org">
      <title>No Version SCORM 1.2</title>
      <item identifier="i1" identifierref="r1"><title>Lesson 1</title></item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="r1" type="webcontent" adlcp:scormtype="sco" href="start.html" />
  </resources>
</manifest>`;
    const parsed = parseScormManifest(noVersionXml);
    expect(parsed.version).toBe("1.2");
    expect(parsed.launchPath).toBe("start.html");
  });

  it("appends parameters to launchPath if defined on resource or item", () => {
    const xmlWithParams = `<?xml version="1.0" encoding="UTF-8"?>
<manifest xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2" xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2">
  <metadata><schemaversion>1.2</schemaversion></metadata>
  <organizations default="org">
    <organization identifier="org">
      <title>Param Course</title>
      <item identifier="i1" identifierref="r1" parameters="?mode=test"><title>Lesson</title></item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="r1" type="webcontent" href="index.html" />
  </resources>
</manifest>`;
    const parsed = parseScormManifest(xmlWithParams);
    expect(parsed.launchPath).toBe("index.html?mode=test");
  });

  it("rejects XML containing XXE entity declarations", () => {
    const xxeXml = `<?xml version="1.0"?>
<!DOCTYPE manifest [
  <!ENTITY xxe SYSTEM "file:///etc/passwd">
]>
<manifest>
  <metadata><schemaversion>1.2</schemaversion></metadata>
  <organizations><organization><title>&xxe;</title></organization></organizations>
  <resources><resource identifier="r1" href="index.html"/></resources>
</manifest>`;
    expect(() => parseScormManifest(xxeXml)).toThrow(/XXE|entity/i);
  });

  it("rejects manifest with unsafe launch path", () => {
    const unsafeXml = scorm12Xml.replace('href="shared/launchpage.html"', 'href="../etc/passwd"');
    expect(() => parseScormManifest(unsafeXml)).toThrow(/unsafe|path/i);
  });

  it("throws for malformed or empty XML", () => {
    expect(() => parseScormManifest("")).toThrow();
    expect(() => parseScormManifest("<manifest><broken")).toThrow();
    expect(() => parseScormManifest("<root></root>")).toThrow(/manifest/i);
  });
});
