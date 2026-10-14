# ─── Mail senders ────────────────────────────────────────────────────────────
# One address per category of email, so a reader (and a filter, and an SPF
# record) can tell a receipt from a nudge. The grouping lives in
# lib/mail-senders.ts; each variable is MAIL_FROM_<GROUP>.
#
# Any group left unset falls back to RESEND_FROM, so setting only the global
# default below still works.
#
# These must also be set on the Convex side, because
# convex/emailCampaigns.ts sends from a "use node" action:
#   npx convex env set MAIL_FROM_COURSES "Glypha Learn <courses@glypha.com.ng>"
# Setting only the Next side leaves certificate and drip mail silently skipped.

# ── account ──  signup, sign-in, profile and security notices
MAIL_FROM_ACCOUNT="Glypha Learn <noreply@glypha.com.ng>"

# ── courses ──  enrollments, lesson progress, the unfinished-course drip
MAIL_FROM_COURSES="Glypha Learn <courses@glypha.com.ng>"

# ── billing ──  payment receipts, refunds, referral credits, instructor payouts
MAIL_FROM_BILLING="Glypha Learn <billing@glypha.com.ng>"

# ── certificates ──  issuance, verification links, reissue notices
MAIL_FROM_CERTIFICATES="Glypha Learn <certificates@glypha.com.ng>"

# ── notifications ──  discussion replies, direct messages, graded work
MAIL_FROM_NOTIFICATIONS="Glypha Learn <notifications@glypha.com.ng>"

# ── instructors ──  applications, review outcomes, payout account setup
MAIL_FROM_INSTRUCTORS="Glypha Learn <instructors@glypha.com.ng>"

# ── updates ──  platform announcements and new-course roundups (broadcast)
MAIL_FROM_UPDATES="Glypha Learn <updates@glypha.com.ng>"

# Fallback for any group left unset above. Also what makes
# `isResendConfigured()` true, so a deployment that only sets this still sends.
RESEND_FROM="Glypha Learn <noreply@glypha.com.ng>"