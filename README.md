# Roost — phone viewer

Read-only glance view of Roost, served by GitHub Pages and wrapped by the mobile
WebView shell. It renders the snapshot the desktop app publishes to Firestore
(`meta/phone_snapshot`) plus live account balances.

**No credentials live here.** The page requires a Firebase sign-in; the session
persists on the device, so it's a one-time sign-in. The Firebase web config below
is public by design — the Firestore security rules (locked to a single user UID)
are what protect the data.

Source of truth for the math is the desktop app; this is a viewer only.

## Layout (build 7)

Five thumb-reachable tabs across the bottom, instead of one long scroll:

| Tab | Shows |
|---|---|
| Home | net worth, last full month, health grade, debt-free date, what Ada owes |
| Spend | the weekly budget, quick logging, and where the money went |
| Accounts | cards & loans, then cash & savings (live balances) |
| Ada | Ada's Debt, grouped by her account with each card expandable |
| Plan | the cut plan, watchdog, top spending, milestones |

## Spend — the one thing the phone WRITES

Everything else here is read-only. The Spend tab is his own weekly tally, kept in
its own collection (`spend_log`) with its settings in `meta/spend_settings`.

**It is deliberately NOT the ledger.** It never writes a transaction and never
feeds cash flow, net worth or the payoff math, so when the bank statement lands
weeks later and imports the same purchase, nothing is counted twice. The desktop
stays the source of truth for what actually left the account; this is the running
total that keeps the week honest.

Logging is two actions: type the amount, tap a category. It saves on the tap,
with an Undo in the toast. Chips are ordered by what he's actually used in the
last 60 days (a starter set fills in until there's history), `+ New` adds a
category, and `All categories` opens the full grouped list. New categories are
written to the SAME `categories` collection the desktop uses, in the desktop's
own shape (`id`, `name`, `group`, `custom`), so one list serves both.

The week runs Sunday to Saturday (`week_start: 0`, stored, not hardcoded).
Below the log: this week by category, the four weeks before it against the
budget, and a four-week category ranking — the "where can I cut" view.

Writes are optimistic and Firestore runs with a persistent local cache, so a
purchase logged in a store with no signal is queued and sent on reconnect
instead of being lost.

## Installing (why it opened in a browser)

`display: standalone`, the icons and a fetch-handling service worker have been
here since build 4/6, but a home-screen icon made with Chrome's **Add to Home
screen** (a shortcut) still opens in a browser tab with the address bar — only
**Install app** produces a real standalone icon, and an icon created before the
manifest existed stays a shortcut forever.

Build 7 added an Install bar: `beforeinstallprompt` is captured in the head (it
can fire before the module parses) and the bar appears only when Chrome says the
page is installable, which it only does when it is NOT already installed. One tap
runs the real install. Dismissing hides it for that session; installing hides it
for good. Delete the old shortcut icon afterwards.

On his phone Chrome offered no install at all, so build 8 removes the one real
defect found: `start_url` was `./?home=1`, and that exact URL was never in the
cache (`caches.match("/roost-view/?home=1")` was false on the live site, even
though `index.html` was there) because cache keys include the query string.
Chrome's install check fetches **start_url** through the worker. `start_url` is
now `./`, the worker matches navigations with `ignoreSearch`, and the manifest
carries an explicit `id` and `display_override`. Nothing read `home=1`.

**App status** in the footer reports what the phone itself sees - running as app
or tab, whether Chrome ever offered an install, service worker state, manifest,
and whether the start page has an offline copy. When the icon opens in a browser
anyway, that readout is the evidence; guessing at Chrome's install criteria from
a desk is not.

The chosen tab is remembered on the device. `window.roostRender(snapshot, accounts, tab)`
renders any tab without signing in, for render-testing.

Ada's Debt comes from the snapshot's `ada` block, computed on the desktop — the phone
never re-derives who owes what. Settled pairs are deleted on the desktop, so anything
shown here is genuinely still owed.
