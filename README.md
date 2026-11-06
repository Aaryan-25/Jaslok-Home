# Jaslok@Home — website, patient & staff portal, office board

| Page | Who | What |
|---|---|---|
| `index.html` | Everyone | Public website: services, how it works, inquiry form, login, patient sign-up |
| `portal.html` | Patients, staff | Patient: current service, history, bills, messages (query / feedback / report staff). Staff: duties, shared patient notes, handover/alert/query to office, billing & income |
| `admin.html` | Admin (one account) | The original card board + new **Portal** tab: inbox, inquiries, notices & messages, accounts, billing status, portal settings |

## First run
1. Open `admin.html`. It asks you to create the single admin account (login ID `admin`).
2. Portal → Accounts → create staff logins (Staff ID + temporary password; they must change it on first login). Use the same name you type in **Assigned Staff** on a case.
3. Patients sign up on the website with their mobile number. Cards whose **Phone** matches appear in their account automatically.
4. Edit the contact details at the top of the `<script>` in `index.html` (`SITE.phone`, `whatsapp`, `email`, `address`, `hours`). Blank ones are hidden.

## How the data connects
- Cases live on the board (Patient Data tab). Four tags were added, hidden from the card face: **Assigned Staff**, **Payment Status**, **Amount Paid**, **Staff Payout**.
- Patient ↔ case: phone number match, or linked by hand in Portal → Accounts.
- Staff ↔ case: their name (or Staff ID) in Assigned Staff. Several staff: separate with commas.
- Staff income = days worked so far × their daily rate (set in Accounts).
- Handover notes go to the office; **Share with staff on this case** makes them visible to every staff member assigned to that patient.

## Online database (Supabase) — one-time setup
1. Supabase dashboard → your project → **SQL Editor** → **New query**.
2. Open `supabase/setup.sql`, copy everything, paste, press **Run**. You should see "Success. No rows returned".
3. Open `admin.html` on the website and create the admin account. Done.

The connection details are in `js/config.js` (project URL, publishable key, Ola Maps key).

How it is protected:
- The website never reads tables directly. All tables have row-level security with no policies, so the public key cannot touch them. Everything goes through the functions in `setup.sql`, which check the login token first.
- Passwords are stored as bcrypt hashes. 8 wrong passwords lock an account for 10 minutes. Patient/staff logins last 30 days, admin 12 hours.
- A patient only receives their own cases, and never the Remarks, Staff Payout, cost or margin columns. A staff member only receives cases assigned to them (patient bill and family phone can be hidden in Portal settings).
- The website inquiry form is limited to 5 per phone number per day.

The board is saved on this device and in the database (header shows "✓ Synced"). Opening `admin.html` on another computer loads the latest board. Avoid editing the board on two computers at the same time: the last save wins.

**Updating:** whenever a new version of `setup.sql` arrives, run it again in the SQL Editor. It keeps all existing data (version 3 added document storage, version 4 adds nurse profiles and reviews).

## Features at a glance
- **Map tab** (office board): patients coloured by nurse, red = no nurse; nurses' homes; click a patient for the nearest free nurse and assign in one click. Uses the Locality on the card + the City setting; Ola Maps looks each place up once and remembers it.
- **Documents**: attach files to a case (choose who sees it: office / patient / staff / both), to messages and replies, and to website inquiries. Max 5 MB each; photos are shrunk automatically. Stored in the database (free plan ≈ 500 MB).
- **Directions** for nurses on each duty (opens Google Maps).
- **Nurse profiles & QR codes**: every staff login gets a public profile (`nurse.html?n=…`) and a QR code for their business card (Portal → Accounts → Profile & QR, with a printable 85×55 mm card). Patients (logged in) rate and review; the office can hide or delete reviews (Portal → Reviews). Visitors can “Request this nurse”.
- **Staff ledger**: the board's Staff tab fills and updates itself from staff accounts, profiles, reviews and Patient Data (duties, days, earnings, payouts, duty history).
- **Install app** button on the website, the portal and the board. The installed app opens straight into the logged-in account.

## Rules
- Never commit patient spreadsheets to the repository; GitHub Pages is public. The keys in `js/config.js` are meant to be public, but restrict the Ola Maps key to your site address in the Ola console.
- After changing any file, raise `VERSION` in `service-worker.js` so installed copies update.
