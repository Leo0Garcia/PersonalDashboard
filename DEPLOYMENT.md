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

Import the repo at vercel.com/new into the `leojgarcia1-4483s-projects` team,
then add three Environment Variables (all three environments):

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://elbocxmdfdjhtbrprmen.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_Gs_b0lXEQ1wwONitk54PYw_-l4ljkQ8` |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | the public key from step 1 |

Then set the Supabase **Site URL** and **Redirect URLs** (Authentication →
URL Configuration) to the deployed origin, or the magic link will bounce back
to localhost.

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
