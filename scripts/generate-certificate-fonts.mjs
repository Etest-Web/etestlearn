/**
 * Regenerates the certificate font assets.
 *
 *   node scripts/generate-certificate-fonts.mjs --download
 *
 * Two outputs, both committed:
 *
 *   public/fonts/*.woff2              the six faces, for the editor's @font-face
 *   lib/certificate-fonts-data.ts     the same faces as base64, for the renderer
 *
 * The renderer runs in a Convex node action with no filesystem and no origin to
 * fetch from, so its copy has to be in the bundle. The editor loads the files
 * over HTTP instead — 144KB of HTTP beats a megabyte in every bundle that
 * ships to a browser.
 *
 * Two forms of each face, because they are not interchangeable:
 *
 *   woff2  what the browser loads. Small, and the browser already knows how.
 *   ttf    what the renderer embeds. pdf-lib puts the bytes it is given
 *          straight into the PDF's font program, so a woff2 would land in the
 *          file as a brotli-wrapped font no reader can draw. It has to be a
 *          real sfnt, and it has to be subsettable — fontkit's subsetter
 *          mis-measures a font it reconstructed from woff2 and writes past the
 *          end of its buffer, which fails the save rather than the embed.
 *
 * Sources are *static instances* of Google's variable fonts: asking Google for
 * weight 400 and 700 returns one identical variable file, and pdf-lib has no
 * way to ask fontkit for an instance, so a variable file would render bold and
 * regular identically. Fontsource ships the instances already resolved, which
 * is why these URLs are used rather than Google's.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fontDir = join(root, "public", "fonts");
const outFile = join(root, "lib", "certificate-fonts-data.ts");
/**
 * Where the TrueType copies are kept between runs.
 *
 * Inside node_modules so it is ignored by git: the TrueType files are a
 * stepping stone to the generated module, not an asset the site serves.
 */
const cacheDir = join(root, "node_modules", ".cache", "certificate-fonts");

const CDN = "https://cdn.jsdelivr.net/fontsource/fonts/";

/**
 * The six faces, keyed by catalogue id.
 *
 * `id` must match `CERTIFICATE_FONTS` in lib/certificate-layout.ts and `file`
 * must match that catalogue's `file` — a test asserts both, because a face the
 * catalogue does not know is a face the renderer would silently print in the
 * default.
 */
const FACES = [
  { id: "inter", file: "inter-400.woff2", path: "inter@latest/latin-400-normal" },
  { id: "inter-bold", file: "inter-700.woff2", path: "inter@latest/latin-700-normal" },
  { id: "cormorant", file: "cormorant-400.woff2", path: "cormorant-garamond@latest/latin-400-normal" },
  { id: "cormorant-bold", file: "cormorant-700.woff2", path: "cormorant-garamond@latest/latin-700-normal" },
  { id: "cormorant-italic", file: "cormorant-400i.woff2", path: "cormorant-garamond@latest/latin-400-italic" },
  { id: "jetbrains", file: "jetbrains-400.woff2", path: "jetbrains-mono@latest/latin-400-normal" },
];

const download = process.argv.includes("--download");

mkdirSync(fontDir, { recursive: true });
mkdirSync(cacheDir, { recursive: true });

async function fetchBytes(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

let rawTotal = 0;
const entries = [];

for (const face of FACES) {
  if (download) {
    const woff2 = await fetchBytes(`${CDN}${face.path}.woff2`);
    writeFileSync(join(fontDir, face.file), woff2);
    console.log(`woff2 ${face.file} (${woff2.length} bytes)`);
  }

  // The woff2 is what the browser loads; the ttf is what the renderer embeds.
  // They are the same typeface at the same weight — the ttf is the woff2
  // unpacked, not a different cut. The ttf is cached so a re-run does not
  // need the network.
  const cached = join(cacheDir, `${face.id}.ttf`);
  if (!existsSync(cached)) {
    writeFileSync(cached, await fetchBytes(`${CDN}${face.path}.ttf`));
  }
  const ttf = readFileSync(cached);
  rawTotal += ttf.length;
  entries.push([face.id, ttf.toString("base64")]);
}

const body = entries
  .map(([id, b64]) => `  ${JSON.stringify(id)}: ${JSON.stringify(b64)},`)
  .join("\n");

writeFileSync(
  outFile,
  `/**
 * The certificate font faces, base64 — GENERATED, do not hand-edit.
 *
 * Re-run \`node scripts/generate-certificate-fonts.mjs --download\` to refresh.
 * The script is where these come from and why they are TrueType rather than
 * woff2: pdf-lib embeds the bytes it is handed as the PDF's font program, so
 * the file has to be a real sfnt a reader can draw, and it has to survive
 * fontkit's subsetter.
 *
 * Total: ${rawTotal} bytes of ttf (${Math.ceil((rawTotal * 4) / 3)} base64).
 * Only the node renderer imports this; the browser loads \`public/fonts\` over
 * HTTP instead.
 */
export const CERTIFICATE_FONT_DATA: Record<string, string> = {
${body}
};

/**
 * Decodes base64 without \`atob\` or \`Buffer\`.
 *
 * The renderer runs in a Convex node action, whose globals are not the
 * browser's, and a certificate that fails to print because a decode helper was
 * missing is not a certificate. So the alphabet is written out and the bytes
 * are assembled by hand — about ${Math.ceil(rawTotal / 1000)}KB of fonts in a
 * few milliseconds.
 */
const BASE64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/**
 * A face's bytes, decoded. Returns null for a face this build does not ship,
 * which the renderer answers with the default sans rather than a throw.
 */
export function certificateFontBytes(id: string): Uint8Array | null {
  const encoded = CERTIFICATE_FONT_DATA[id];
  if (!encoded) return null;

  const clean = encoded.replace(/=+$/, "");
  const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let at = 0;
  let buffer = 0;
  let bits = 0;

  for (let i = 0; i < clean.length; i++) {
    const value = BASE64_ALPHABET.indexOf(clean[i]);
    if (value === -1) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[at++] = (buffer >> bits) & 0xff;
    }
  }

  return bytes.subarray(0, at);
}
`,
);

console.log(
  `wrote ${outFile} (${rawTotal} bytes of ttf, ${entries.length} faces)`,
);
