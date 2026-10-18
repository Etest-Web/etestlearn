import { describe, expect, it } from "vitest";
import {
  IMAGE_PAGE_LONG_EDGE,
  imagePageSize,
  readImageSize,
  sniffBackgroundKind,
} from "./certificate-background";
import { TINY_JPEG, buildPng } from "@/tests/helpers/png";

const bytes = (...values: number[]) => new Uint8Array(values);

describe("sniffBackgroundKind", () => {
  it("recognises a PDF by its magic bytes", () => {
    expect(sniffBackgroundKind(bytes(0x25, 0x50, 0x44, 0x46, 0x2d))).toBe("pdf");
  });

  it("recognises a PNG", () => {
    expect(sniffBackgroundKind(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a))).toBe(
      "png",
    );
  });

  it("recognises a JPEG", () => {
    expect(sniffBackgroundKind(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("jpeg");
  });

  it("returns null for anything else", () => {
    expect(sniffBackgroundKind(bytes())).toBeNull();
    expect(sniffBackgroundKind(bytes(0x47))).toBeNull();
    // A GIF, and a bare `<?xml` — the shapes that get offered to file pickers
    // and must not reach a parser.
    expect(
      sniffBackgroundKind(bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61)),
    ).toBeNull();
    expect(
      sniffBackgroundKind(bytes(0x3c, 0x3f, 0x78, 0x6d, 0x6c)),
    ).toBeNull();
  });

  it("is decided by the bytes, not by what follows them", () => {
    // A text file that merely begins like a PDF, which is what a `.pdf`
    // extension alone would let through.
    expect(
      sniffBackgroundKind(
        bytes(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x68, 0x69),
      ),
    ).toBe("pdf");
  });

  it("needs enough bytes to identify anything", () => {
    expect(sniffBackgroundKind(bytes(0x25, 0x50))).toBeNull();
    expect(sniffBackgroundKind(bytes(0xff, 0xd8))).toBeNull();
  });
});

describe("imagePageSize", () => {
  it("puts the long edge on A4 landscape and keeps the aspect ratio", () => {
    const landscape = imagePageSize(2000, 1400);
    expect(landscape.width).toBeCloseTo(IMAGE_PAGE_LONG_EDGE, 5);
    expect(landscape.height).toBeCloseTo((1400 / 2000) * IMAGE_PAGE_LONG_EDGE, 5);
  });

  it("makes the long edge vertical for a portrait image", () => {
    const portrait = imagePageSize(900, 1200);
    expect(portrait.height).toBeCloseTo(IMAGE_PAGE_LONG_EDGE, 5);
    expect(portrait.width).toBeCloseTo((900 / 1200) * IMAGE_PAGE_LONG_EDGE, 5);
  });

  it("gives the same page to the same design at any resolution", () => {
    // The point of normalising: a 2× export is the same artwork, so it must
    // lay out identically rather than at half the font size.
    const small = imagePageSize(1000, 700);
    const large = imagePageSize(4000, 2800);
    expect(large.width).toBeCloseTo(small.width, 5);
    expect(large.height).toBeCloseTo(small.height, 5);
  });

  it("falls back to a square page rather than dividing by zero", () => {
    expect(imagePageSize(0, 0)).toEqual({
      width: IMAGE_PAGE_LONG_EDGE,
      height: IMAGE_PAGE_LONG_EDGE,
    });
  });
});

describe("readImageSize", () => {
  it("reads a PNG's size from the IHDR without decoding it", () => {
    // 30000×20000 is the size a decompression bomb *claims*; reading it here
    // is what lets the uploader refuse it before a decoder is handed the file.
    expect(readImageSize(buildPng(1234, 5678), "png")).toEqual({
      width: 1234,
      height: 5678,
    });

    const bomb = buildPng(1, 1);
    new DataView(bomb.buffer).setUint32(16, 30000);
    new DataView(bomb.buffer).setUint32(20, 20000);
    expect(readImageSize(bomb, "png")).toEqual({ width: 30000, height: 20000 });
  });

  it("reads a JPEG's size from its frame header", () => {
    expect(readImageSize(TINY_JPEG, "jpeg")).toEqual({ width: 1, height: 1 });
  });

  it("returns null for a truncated or mislabelled file", () => {
    expect(readImageSize(new Uint8Array(8), "png")).toBeNull();
    expect(readImageSize(new Uint8Array([0x89, 0x50]), "png")).toBeNull();

    // Right signature, but the IHDR chunk name has been overwritten — a file
    // that starts like a PNG and stops being one.
    const noIhdr = buildPng(10, 10);
    noIhdr.set([0x4a, 0x50, 0x4c, 0x54, 0x45], 12);
    expect(readImageSize(noIhdr, "png")).toBeNull();

    // A PNG handed to the JPEG reader must not be believed.
    expect(readImageSize(buildPng(10, 10), "jpeg")).toBeNull();
    expect(readImageSize(TINY_JPEG, "png")).toBeNull();
  });
});
