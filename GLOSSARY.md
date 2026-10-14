# Glypha Learn

The LMS this repository implements: course catalog, enrollments, lessons,
quizzes, certificates, Paystack payments, and the instructor and admin
consoles behind them.

## Language

**Payout account**:
The verified Nigerian bank account an instructor's course earnings are sent
to. Set exactly once; later changes go through support.
_Avoid_: bank details, payout bank details, payment account

**Payout nudge**:
The single unread inbox notification an instructor without a payout account
receives. Idempotent, so repeat logins do not stack rows.
_Avoid_: reminder, prompt

**One-shot save**:
The refusal of a second payout account save. A deliberate product rule, not a
technical limit, and the reason the setup dialog exists as a dialog.
_Avoid_: lock, freeze
