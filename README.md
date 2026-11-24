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
| `budget_history` | `[]` | `[{from, amount}]`, oldest first: when the weekly budget changed and to what. `from` is a week start; `0000-01-01` means "as far back as the log goes". |
| `carry_from` | `""` | the week the carry chain starts at. Weeks before it are settled and never re-added. |

### The budget is DATED (build 16)

**The budget is not one number.** `carryInto` replays every week from the log back
to `carry_from`, and it used to settle each of them against the budget *as it is
right now*. So editing the budget rewrote the past: drop it by $150 and eleven
finished weeks were re-scored against the new figure, each shortfall compounding
into the next — a **$550 banked credit became $1,100 of debt**, and once the carry
passed the budget `budget = BUDGET - carry` went negative and the screen said
**"no weekly budget set"** to a man who had one.

So `budgetFor(weekStart)` reads `budget_history`, every week is scored against the
figure that was in force *that* week, and `saveBudget` records a change effective
from the current week start (the first change writes the old figure down against
`0000-01-01`, or the finished weeks would silently inherit the new one). An edit
now only ever moves the week he is standing in and the ones after it.

The desktop's `budget.send_to_phone` writes the same history entry. An older build
of either wrote only `weekly_budget`, so `reconcileBudgetHistory()` on load notices
a stored figure that is ahead of the record and dates it to the current week — the
earliest week it can honestly be blamed on — rather than letting it reach back.

Three guards, all deliberate:

- **A week with nothing logged moves the carry neither way.** Forgetting to log is
  not the same as spending nothing. Without this a gap in the log would mint a
  full week of phantom credit, and the old debt-only code silently *forgave* a
  full week of real debt the same way. A week with no budget on record moves it
  neither way either — there was nothing to be over or under.
- **Credit is capped, debt is not.** A long quiet stretch cannot turn the budget
  into a blank cheque, and overspend is never forgiven.
- **`carry_from` is the one way out.** A carry built out of numbers that turned
  out to be wrong can be written off once, from the carry note's "Start fresh from
  this week" (confirmed first). There is no cap on debt and no other amnesty.

**A budget eaten by the carry is not the absence of a budget.** `viewSpend` keeps
`base` (this week's figure), `hasBudget` (`base > 0`) and `budget` (`base - carry`,
allowed to go negative) apart, and shows the week at `$0.00` with what is still
owed. Only `!hasBudget` prints "no weekly budget set". The watch's `Standing` has
the same `hasBudget`/`room` split for the same reason.

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
