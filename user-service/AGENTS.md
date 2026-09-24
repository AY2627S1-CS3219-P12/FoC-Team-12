# User Service agent boundary

Owner: Darryl.

## In scope

- NUS-email registration, login/tokens, reset OTP, profiles, roles/RBAC, and account lifecycle.
- Protected user fields and administrator access workflows.
- Admin Dashboard implementation inside the User-owned area.
- User database, migrations, tests, API contract, and identity integration documentation.

## Out of scope

Do not implement Supplier data, Order lifecycle, Credit balances, Logging storage,
Notifications, or Chat. Publish stable user IDs and identity/role claims for those services;
never give them direct database access.

Use the D2-D4 User/Admin criteria in `TASK_SPLIT.md` and the approved backlog as acceptance
sources. Do not invent account states, token policy, OTP policy, or admin powers if unspecified.
