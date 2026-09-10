# Deployment

The app is built and the Supabase backend is live. Four things still need doing
by hand — they need credentials this session could not reach.

Supabase project: `personal-dashboard` (`elbocxmdfdjhtbrprmen`, eu-west-2)
URL: `https://elbocxmdfdjhtbrprmen.supabase.co`

## 1. Generate VAPID keys

Web push needs a keypair. Generate one:

```bash
node -e '
const { generateKeyPairSync } = require("crypto");
const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const pub = publicKey.export({ type: "spki", format: "der" }).subarray(-65);
console.log("PUBLIC :", Buffer.from(pub).toString("base64url"));
console.log("PRIVATE:", privateKey.export({ format: "jwk" }).d);
'
```

The **public** key is safe in the client bundle. The **private** key is a
secret: it goes only into Supabase Edge Function secrets, never into
`.env.local`, never prefixed `NEXT_PUBLIC_`, never committed.

## 2. Supabase Edge Function secrets

Dashboard → Project Settings → Edge Functions → Secrets. Add:

| Name | Value |
|---|---|
| `VAPID_PUBLIC_KEY` | the public key from step 1 |
| `VAPID_PRIVATE_KEY` | the private key from step 1 |
| `VAPID_SUBJECT` | `mailto:leojgarcia1@icloud.com` |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.

## 3. Vault secret for the hourly scheduler

The `notification-rules-hourly` cron job is scheduled and active, but no-ops
until it can authenticate. In the SQL editor, run:

```sql
select vault.create_secret(
  '<your service role key>',
  'service_role_key',
  'Used by the hourly notification rules cron job'
);
```

Get the service role key from Project Settings → API. It is stored encrypted;
the cron function reads it at run time so it never appears in a migration.

Verify:

```sql
select * from cron.job;                                    -- should be active
select * from cron.job_run_details order by start_time desc limit 5;
```

## 4. Vercel

This session could not create the project — the Vercel token it has is allowed
to create deployments but not projects (403 `forbidden` on `create project`).
So this part is yours:

1. Go to <https://vercel.com/new>, pick the `leojgarcia1-4483s-projects` team,
   and import `Leo0Garcia/PersonalDashboard`.
2. Set **Production Branch** to `working/charming-cerf-6768sl` (or merge that
   branch into `main` first and leave the default).
3. Deploy. **No environment variables are required** — `.env.production` in the
   repo carries the Supabase URL and publishable key, both of which are public
   by design and useless without a signed-in session because of RLS.
4. Only once you have done step 1 above: add `NEXT_PUBLIC_VAPID_PUBLIC_KEY` as
   an environment variable so push can be enabled. Until then the settings
   screen reports push as unsupported rather than erroring.

## 5. Auth redirect URLs — required, or sign-in will not work

Supabase rejects magic-link redirects to origins it does not know, and the
default is `http://localhost:3000`. In the dashboard: **Authentication → URL
Configuration**:

- **Site URL**: your Vercel production origin, e.g. `https://personal-dashboard-xxxx.vercel.app`
- **Redirect URLs**: add `https://<your-origin>/auth/callback` (and
  `http://localhost:3000/auth/callback` if you want local dev to work too)

Skip this and the sign-in email will arrive but the link will bounce to
localhost. There is no MCP tool for Supabase auth config, so this cannot be
automated from a session.

## 6. Calendar sync (Apple Calendar / iCal)

The `calendar-sync-half-hourly` cron job and the `sync-calendars` function are
already in place. They use the SAME Vault secret as step 3, so once that exists
both schedulers work.

To connect a calendar, open Settings → Calendars in the app and paste a
published iCal URL:

- **Apple, on a Mac**: Calendar → right-click the calendar → Share Calendar →
  tick *Public Calendar* → copy the `webcal://` link.
- **Apple, on iPhone**: Calendar → Calendars → ⓘ next to a calendar → turn on
  *Public Calendar* → Share Link.
- **Google**: Settings → the calendar → *Secret address in iCal format*.

Sync is one-way and read-only — nothing ever writes back to Apple or Google.
Note that a published Apple calendar URL is readable by anyone who has it, so
treat it like a password.

## Installing on your devices

- **iPhone**: open the URL in Safari → Share → Add to Home Screen. It must be
  installed this way before push notifications can be enabled at all — iOS
  does not expose the Push API to a normal Safari tab. Then Settings → Enable
  notifications.
- **MacBook**: Safari → File → Add to Dock.

## What to check once it is live

- Create a task on the phone; it should appear on the Mac within a second or
  so without a refresh (Realtime).
- Move a card on the Mac and confirm in the SQL editor that only that row's
  `rank` changed.
- Turn on airplane mode and cold-launch the installed iPhone app: the board
  should render from cache with the capture field visibly disabled.
- Settings → Send test notification, with the app fully closed.
- Run `select * from notification_log` after the first digest fires; a second
  run in the same hour must not add a row.
