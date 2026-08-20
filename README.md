# Roost — phone viewer

Read-only glance view of Roost, served by GitHub Pages and wrapped by the mobile
WebView shell. It renders the snapshot the desktop app publishes to Firestore
(`meta/phone_snapshot`) plus live account balances.

**No credentials live here.** The page requires a Firebase sign-in; the session
persists on the device, so it's a one-time sign-in. The Firebase web config below
is public by design — the Firestore security rules (locked to a single user UID)
are what protect the data.

Source of truth for the math is the desktop app; this is a viewer only.

## Layout (build 5)

Four thumb-reachable tabs across the bottom, instead of one long scroll:

| Tab | Shows |
|---|---|
| Home | net worth, last full month, health grade, debt-free date, what Ada owes |
| Accounts | cards & loans, then cash & savings (live balances) |
| Ada | Ada's Debt, grouped by her account with each card expandable |
| Plan | the cut plan, watchdog, top spending, milestones |

The chosen tab is remembered on the device. `window.roostRender(snapshot, accounts, tab)`
renders any tab without signing in, for render-testing.

Ada's Debt comes from the snapshot's `ada` block, computed on the desktop — the phone
never re-derives who owes what. Settled pairs are deleted on the desktop, so anything
shown here is genuinely still owed.
