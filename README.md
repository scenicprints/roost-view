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

### Carry between weeks

`carryInto(weekStart)` returns a **signed** carry: positive is owed, negative is
banked. Overspend rolls forward as a debt that shrinks the next budget and keeps
taking until a lean week clears it. Underspend rolls forward as credit that grows
it, so a lean week is how he saves up for something inside the budget instead of
putting it on a card.

Settings live beside the budget in `meta/spend_settings`:

| key | default | meaning |
|---|---|---|
| `rollover` | `true` | both directions. `false` restores the old debt-only behaviour. |
| `rollover_cap_weeks` | `4` | banked credit is floored at N weeks of budget. `0` = uncapped. |

Two guards, both deliberate:

- **A week with nothing logged moves the carry neither way.** Forgetting to log is
  not the same as spending nothing. Without this a gap in the log would mint a
  full week of phantom credit, and the old debt-only code silently *forgave* a
  full week of real debt the same way.
- **Credit is capped, debt is not.** A long quiet stretch cannot turn the budget
  into a blank cheque, and overspend is never forgiven.

The header note reads "Carried over: $X of overspend" or "Banked: $X from weeks
you came in under", and says what this week is instead of the base budget. The
"next week starts at" line shows any day when he is over, because over is settled
the moment it happens, but only on the last day when he is under, because telling
him on Tuesday that next week will be bigger is flattery, not feedback.

**Rollover only means anything if the logging is complete.** A week he half-logged
looks like a lean week and banks credit he never earned. The zero-row guard catches
a blank week, not a partial one.

Writes are optimistic and Firestore runs with a persistent local cache, so a
purchase logged in a store with no signal is queued and sent on reconnect
instead of being lost.

### Where the weekly budget comes from (build 14)

The budget used to be a number typed into a box. Now it is **worked out**: take-home
pay minus the monthly bills, spread over 52 weeks, and written to the same
`weekly_budget` everything above reads. Type a take-home amount and pick how often it
lands (monthly, twice a month, every two weeks, weekly); the box for a hand-typed
budget goes away while take-home is set and comes back when it is cleared.

Bills are entered as **company + amount**. Adding the same company again with another
month's amount folds into the same bill, and the bill is budgeted at the **average** of
every amount entered, because an electric bill is not the same number twice. Tap a bill
to see each amount, drop one, add another, or remove the bill (with an Undo). Names
match case-insensitively, and the company field offers the names already entered.

Stored in `meta/spend_settings` beside the budget it produces:

| key | meaning |
|---|---|
| `take_home` | the amount per paycheck, `0` or missing = budget is set by hand |
| `take_home_per` | `month`, `half` (twice a month), `2wk`, `wk` |
| `bills` | `[{ id, name, amounts: [..] }]`, each budgeted at the mean of `amounts` |

Weekly = max(0, (monthly take-home − Σ mean(bill)) × 12 ÷ 52). When the bills come to
more than the take-home the budget reads $0 and the screen says by how much, rather
than carrying a negative number into the week. On load the budget is re-derived from
these inputs, never trusted from the stored copy, so the number on screen cannot
drift from what is under it. `window.roostBudgetTest(takeHome, per, bills, openId)`
renders the section without signing in.

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
