---
name: Lighthouse Auth Architecture
description: Session auth, session table, bcrypt choice, and seed idempotency for the Lighthouse MVP.
---

## Auth stack
- express-session + connect-pg-simple (session store in DB) + bcryptjs (pure-JS, no native build)
- Session cookie: name `lh_sid`, httpOnly, secure in prod, sameSite lax, 30 days
- Session type augmentation: `artifacts/api-server/src/types/session.d.ts` declares `userId`, `householdId`, `role` on SessionData
- Do NOT import the `.d.ts` file from `app.ts` — esbuild can't bundle declaration files; TypeScript picks it up automatically

## Session table
- `connect-pg-simple` with `createTableIfMissing: true` fails when esbuild bundles the server because `table.sql` is not in dist/
- **Fix:** Create the session table manually once via SQL, set `createTableIfMissing: false` (or omit it)
- SQL for session table: standard Netscape cookie table with `sid varchar PK`, `sess json`, `expire timestamp(6)` + IDX on expire

## bcrypt vs bcryptjs
- `bcrypt` (native) requires native build scripts which pnpm blocks with `Ignored build scripts: bcrypt`
- Use `bcryptjs` (pure JS) — identical API, no build approval needed, cost 12

## Seed function
- `checkAndSeed()` in `artifacts/api-server/src/lib/seed.ts` called from `index.ts` after server start
- Idempotent: checks if any household exists, skips if so
- Creates: household → Alex (adult) → Morgan (adult) → Jamie (child profile)
- Demo credentials: alex@example.com / lighthouse123, morgan@example.com / lighthouse123
- Seeds experience profiles from `DEFAULT_PROFILES` keyed by `member.displayName.toLowerCase()`

## inviteeIds type
- DB stores inviteeIds as jsonb containing integer user IDs
- API returns them as `number[]`
- Frontend comparisons must use `Number(id) === user.id` — avoid String() cast which breaks includes()
- `formatInvitation` enriches response with `inviterName`, `inviterInitials`, `inviterColor`, `inviteeNames` by joining users table

## Privacy filtering
- Profile traits with visibility `private` or `ai-only` are stripped from cross-user responses in `family-members.ts`
- Only traits with visibility in `{ share-exact, share-summary, surprise-ok }` pass through to other members

**Why:** Privacy model principle — "This app helps us remember what we chose to share."
