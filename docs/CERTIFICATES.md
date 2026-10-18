# Certificates

Certificates are issued when a learner completes a course, then rendered as a
PDF, emailed, and verifiable by anyone with the link.

## Completion rule

A learner earns a certificate when **every lesson is completed and every quiz
is passed**. There is one definition of "completed", in
`lib/certificates.ts#evaluateCertificateCompletion`, and three consumers:

| Consumer | Where |
| --- | --- |
| Issuance | `convex/certificates.ts#issueForUser` |
| Learner UI | `convex/certificates.ts#getCourseCertificateStatus` |
| Unit tests | `lib/certificates.test.ts` |

Lesson and quiz ids are loaded by `convex/helpers/completion.ts`. A lesson
deleted after a learner finished it does not permanently block the certificate,
because only ids still attached to the course count.

## Automatic issuance

`internal.certificates.issueIfEligible` runs at the end of both
`enrollments.completeLesson` and `quizzes.submitQuizAttempt`, so passing the
final quiz is often the last thing needed. It is idempotent and does nothing
until the learner actually qualifies.

A learner can also request issuance themselves with
`certificates.issueCertificate` (idempotent — clicking twice returns the same
certificate).

## Artifacts: PDF and email

`issueForUser` inserts the certificate row, then schedules
`internal.certificateArtifacts.issueCertificateArtifacts` via
`ctx.scheduler`. Scheduling rather than running inline matters twice over:

- Mutations cannot call `runAction`, only queries and actions can.
- A render or SMTP failure must not roll back an issuance that already
  succeeded in the database.

That action is a `"use node"` action (`convex/certificateArtifacts.ts`)
because it needs `pdf-lib` and `nodemailer`. It renders the PDF
(`lib/certificate-pdf.ts`) into Convex storage, records the storage id, then
emails the learner their verify link. Each step is individually guarded — a
broken SMTP config never blocks the certificate itself.

## The template

There is **one** certificate design. An admin uploads a designed background at
`/dashboard/admin/certificates` (top card, "Certificate design"), and every new
certificate is stamped onto **page 1 of it** (`lib/certificate-pdf.ts`). With
no template installed, the built-in bordered A4 landscape artwork is drawn
instead.

**The background may be a PDF, a PNG or a JPEG.** The kind is read from the
file's magic bytes by `lib/certificate-background.ts` — never from a content
type, since that is a claim the uploader makes and every decision below depends
on getting it right. SVG is deliberately refused (it can carry script); so are
GIF and WebP, which pdf-lib cannot embed, because a background that renders
differently in the finished PDF than it did in the editor is worse than one
that has to be converted first.

An image needs a page size it does not bring with it. `imagePageSize` scales it
onto a page whose **long edge is 1123.15pt** (A4 landscape's), preserving the
aspect ratio. That is not cosmetic: field sizes are absolute in page units, so
storing raw pixel dimensions would make a 2000px export print its recipient's
name at twice the size of the same design exported at 1000px. The recorded size
is what the renderer uses, so a later change to the rule cannot silently move
every already-saved placement.

Because there is only ever one, there is no gallery and nothing to choose from:
no activate, no deactivate, no list. `saveTemplate` patches the single row in
place, so the id stays stable across re-uploads — certificates record it at
issuance, and churning the id would orphan that history for no benefit. Uploading
again deletes the superseded file from storage.

Upload goes through three steps so a bad file can never become the live design:

1. `files.generateUploadUrl` → POST the file (same pattern as avatars and
   thumbnails)
2. `certificateTemplateActions.prepareTemplateUpload` — a node action that checks
   the magic bytes, that the file parses, that it has a page (PDF) or sane
   dimensions (image), and that it is under 20 MB
3. `certificateTemplates.saveTemplate` with the verified page geometry

One check is worth spelling out. **An image's size is read from its headers
before pdf-lib is allowed near it.** `embedPng` expands the file to RGBA in
memory, so a 1×1 PNG with a forged 40000×40000 IHDR is a few kilobytes on the
wire and several gigabytes of heap before a size check could object.
`readImageSize` parses the IHDR (or the JPEG frame header) directly, and the
10000px ceiling is applied against that — decoding only happens once the file
is known to be small enough to decode. Do not "simplify" this back to measuring
by embedding.

Two defaults matter here:

- **The heading is suppressed when a template is installed.** A designed
  background normally prints its own title, and drawing ours on top is what
  produces overlapping text. `TEMPLATE_DEFAULTS` in `lib/certificate-layout.ts`
  omits it; `DEFAULT_LAYOUT` keeps it for the no-template case. An image gets the
  same treatment as a PDF — one default serves both.
- **Field positions are fractions of the page**, so one set of numbers works for
  any template size. An admin can override any field, and setting a field to
  `null` keeps it off the certificate entirely.

Both sets of positions and the `x,y` / `x,y,size` / `off` parse format live in
`lib/certificate-layout.ts`, which has no pdf-lib import so the renderer and the
admin editor read the same numbers. `parseAnchor` validates syntax and throws on
a mistyped value rather than silently falling back; the on-page range is enforced
server-side by `updateTemplateLayout`, so that rule has one home.

### Editing placement

Placement is edited **on a canvas, not in coordinate boxes**
(`components/certificate-canvas.tsx`). The canvas draws the installed
background at its true proportions — pdf.js rasterises a PDF page, an image is
drawn from its decoded bitmap — and the six fields sit on it as objects: drag to
move, drag the blue dot on a selected field to resize its text, arrow keys to
nudge (Shift for ten steps), and a magnetic centre line catches a field as it
passes the middle of the page. A panel alongside offers exact percentages and a
point size, a per-field visibility switch (the old `off`, without spelling it),
centre and reset controls, a page-guides toggle, and the raw `x,y` boxes behind
a "Paste coordinates" disclosure for anyone working from written numbers.

The background bytes are **fetched once and sniffed**, then handed to whichever
decoder the magic bytes call for — pdf.js gets the same buffer the sniff looked
at, an image gets a blob URL built from it. Nothing downloads twice; these files
run to 20MB. When the bytes turn out to be neither, the canvas falls back to the
built-in artwork and says so rather than going blank.

For that to be truthful rather than approximate, the typography lives in the
same shared module as the positions: font roles and colours, `wrapText` /
`wrapCharBudget` for the wrapped course title, the learner-name truncation
limit, and `CANVAS_BASELINE_NUDGE` — the correction between pdf-lib's baseline
and a CSS line box, without which the preview sits a hair above where the text
prints. "Render PDF preview" still exists as the final word: it goes through the
real renderer with sample data.

### Which template a certificate used

`certificates.templateId` is snapshotted at issuance. The render action reads
that recorded id rather than "whatever is installed now", so replacing the design
cannot retroactively change an already-issued certificate.

### Split modules

Template management is deliberately two files:

- `convex/certificateTemplates.ts` — queries and mutations
- `convex/certificateTemplateActions.ts` — `"use node"` actions (upload
  validation, preview)

A `"use node"` module may only export actions, so mixing them fails at deploy.
Actions have no `ctx.db`, so admin checks there go through the
`getCallerRole` internal query. Both, plus `certificates.issueForUser`, read the
installed row through `getInstalledTemplate`
(`convex/helpers/certificateTemplate.ts`) rather than repeating the index query.

### Previews

`previewTemplate` renders sample data against the installed template with unsaved
positions, stores it, and schedules `deletePreviewFile` an hour later so previews
do not accumulate in storage. With no template installed it previews the built-in
artwork, which is what certificates would actually be stamped onto today.

## Public verification

`GET /verify/<serial>` is intentionally unauthenticated.
`certificates.getCertificateForVerification` takes a `ref` and tries the
`by_serial` index first, then falls back to a document id, so links issued
before serials existed keep working. Revoked certificates return
`valid: false` with the revocation reason rather than disappearing — the record
is an audit trail.

Serials look like `GL-2026-3F9A1C77`: prefix, issue year, 8 chars of UUID
entropy. Issuance retries on collision so a serial is never ambiguous.

## Revocation

`revokeCertificate` and `reinstateCertificate` are owner-or-admin only
(`canManageCourse`). Revocation sets `revokedAt` / `revokedBy` /
`revocationReason`; the row is kept. The learner-facing PDF download is
suppressed for revoked certificates and the verify page reports it as
withdrawn.

## Management surfaces

| Surface | Route | Data |
| --- | --- | --- |
| Learner list | `/dashboard/certificates` | `listMyCertificates` |
| Learner detail | `/dashboard/certificates/[id]` | `getMyCertificate` |
| Instructor, per course | instructor course page → Certificates tab | `listCourseCertificates`, `issueCertificateForLearner` |
| Admin, platform-wide | `/dashboard/admin/certificates` | `listAllCertificates` |
| Admin, the design | same page — "Certificate design" card | `getTemplate`, `saveTemplate`, `updateTemplateLayout`, `deleteTemplate`, `previewTemplate` |

`listMyCertificates` joins course and PDF server-side. The previous version
fetched published courses separately and silently dropped certificates whose
course was unpublished.

## Backfill

`certificates.backfillCertificateDetails` is an `internalMutation` that fills
in `serial`, `holderName`, `courseTitle`, and `issuerName` on certificates
issued before those fields existed. Run it once after deploying the schema
change:

```ts
// from the Convex dashboard → Functions, or:
// npx convex run certificates:backfillCertificateDetails
```

## Environment

The artifact action runs inside Convex, so these must be set in the Convex
dashboard environment, not only in `.env.local`:

| Variable | Used for |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Absolute verify links in PDFs and emails. Defaults to `http://localhost:3000`. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Transport for certificate email. |
| `SMTP_FROM` | Envelope sender. Falls back to `SMTP_USER`. |

With no SMTP config the certificate is still issued, rendered, and
downloadable — only the email is skipped, with a warning in the logs.

## Tests

- `lib/certificates.test.ts` — completion rules, serial format, formatting
- `lib/certificate-layout.test.ts` — placement parse/format round-trip, default
  positions, mistyped-input rejection, plus the canvas's shared typography:
  wrapping, the char budget, truncation, colours and every field's sample text
- `lib/certificate-background.test.ts` — magic-byte sniffing (PDF/PNG/JPEG, and
  the null answer for everything else), the image→page normalisation including
  that the same design at two resolutions lays out identically, and the
  header-only size readers
- `lib/certificate-pdf.test.ts` — template overlay, page-1-only, fallback on a
  bad template, heading suppression, field overrides, and that a long learner
  name is clipped where the editor clips it. Also the image background: that it
  renders at the *recorded* page size rather than its pixel size, that a file
  merely claiming to be a PNG falls back, and that the heading rules are the
  same for both kinds
- `tests/certificates.test.ts` — issuance, idempotency, auto-issue, template
  snapshotting, access control, public verification
- `tests/certificateTemplates.test.ts` — template RBAC, replace-in-place, stable
  id, layout validation, delete cleans up storage
- `tests/http-hardening.test.ts` — the active-content scan on PDFs, plus the
  image path: normalisation, JPEG acceptance, the size ceiling refused against a
  forged IHDR, and a file that only claims to be a PNG

Real image fixtures (a correctly-encoded PNG built byte by byte, and a baseline
JPEG) live in `tests/helpers/png.ts`. They are encoded properly rather than
pasted as base64 because the assertions are about genuine images going through
the pipeline — a subtly malformed constant would turn a downstream failure into
a mystery. They caught a real bug while this was being written: the PNG reader
was checking `IHDR` as `49 48 52 44` rather than `49 48 44 52`, which no amount
of reading the code by eye would have shown.