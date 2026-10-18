# Glypha Learn

The LMS this repository implements: course catalog, enrollments, lessons,
quizzes, certificates, Paystack payments, and the instructor and admin
consoles behind them.

## Language

**Payout account**:
The verified Nigerian bank account a staff member's (instructor or admin)
course earnings are sent to. Set exactly once; later changes go through
support.
_Avoid_: bank details, payout bank details, payment account

**Payout nudge**:
The single unread inbox notification a staff member without a payout account
receives. Idempotent, so repeat logins do not stack rows.
_Avoid_: reminder, prompt

**One-shot save**:
The refusal of a second payout account save. A deliberate product rule, not a
technical limit, and the reason the setup dialog exists as a dialog.
_Avoid_: lock, freeze

**Bookmark**:
A learner's private save of a course for later. No rating, no note, no
enrolment — just an intent to come back. Read back at `/dashboard/saved`.
_Avoid_: wishlist, favourite, saved course

**Instructor review**:
A star a learner leaves for the *person* who taught them, aggregating across
every course that instructor has. Distinct from a course review, which is about
one listing.
_Avoid_: teacher rating, tutor review

**Course project**:
An instructor-curated example of something a learner can have built by the end
of a course. Display-only: a learner cannot submit their own work here.
_Avoid_: assignment, capstone, submission
