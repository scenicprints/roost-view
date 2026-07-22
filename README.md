# Roost — phone viewer

Read-only glance view of Roost, served by GitHub Pages and wrapped by the mobile
WebView shell. It renders the snapshot the desktop app publishes to Firestore
(`meta/phone_snapshot`) plus live account balances.

**No credentials live here.** The page requires a Firebase sign-in; the session
persists on the device, so it's a one-time sign-in. The Firebase web config below
is public by design — the Firestore security rules (locked to a single user UID)
are what protect the data.

Source of truth for the math is the desktop app; this is a viewer only.
