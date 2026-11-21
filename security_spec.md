# Security Specification — Atelier Club Firestore Rules

## 1. Data Invariants
1. A user document `/users/{userId}` can only be read, created, updated, or deleted by the authenticated owner (`request.auth.uid == userId`) with a verified email (`request.auth.token.email_verified == true`) for writes.
2. PII (`email`) is strictly isolated in `/users/{userId}/private/info`, never placed on `/users/{userId}` and never listable.
3. Favorites (`/users/{userId}/favorites/{wallpaperId}`) and Studio Projects (`/users/{userId}/projects/{projectId}`) require the parent `/users/{userId}` profile document to exist (`exists(...)`) and enforce `uid == request.auth.uid`.
4. Admin privileges (`isAdmin()`) require `request.auth.token.email_verified == true` AND either the bootstrapped admin Google email (`miqueiasmelouber@gmail.com`) or a matching `/admins/{uid}` document. Unverified emails are always denied.
5. `/appConfig/monetization` is publicly readable via single-document `get` (contains only public publisher AdSense/AdMob IDs and announcement text, zero PII), non-listable (`allow list: if false`), and writable strictly by `isAdmin()` with strict regex validation on AdSense/AdMob IDs.
6. `/catalogItems/{itemId}` allows public `get`/`list` only for visible items (`isHidden == false`) or by the verified admin (`isBootstrappedAdmin()`), with zero `get()`/`exists()` calls inside `allow list`, and allows writes strictly by `isAdmin()` with URL scheme constraints (`https://` or `/src/assets/`).
7. All path IDs (`userId`, `wallpaperId`, `projectId`, `adminUid`, `docId`, `itemId`, `subId`, `alertId`) must match `^[a-zA-Z0-9_\-]+$` and be `<= 128` characters.
8. All `createdAt` and `updatedAt` timestamps must strictly equal `request.time`; `createdAt`, `uid`, `id`, and `createdBy` are immutable on update.
9. `/pushSubscriptions/{subId}` isolates FCM device tokens per verified owner (`uid == request.auth.uid`); non-admins cannot read or list other users' push tokens, and only `isBootstrappedAdmin()` / `isOwner()` can read or delete subscriptions.
10. `/collectionAlerts/{alertId}` is publicly readable (`id is string`, zero PII), immutable on update (`allow update: if false`), and writable/deletable strictly by `isAdmin()` with URL scheme constraints (`https://` or `/src/assets/`).
11. `/users/{userId}/aiHistory/{entryId}` requires parent `/users/{userId}` existence (`exists(...)`), restricts read/list/create/delete strictly to `isOwner(userId)` (`uid == request.auth.uid`), enforces immutable entries (`allow update: if false`), and caps string sizes (`prompt <= 500`, `resultTitle <= 120`).

## 2. Adversarial Test Payloads ("Dirty Dozen" + Admin RBAC + FCM)
1. **Identity Spoofing on Profile Create**: `{ "uid": "other_user", "displayName": "Hacker", ... }` -> DENIED (`uid != userId`).
2. **Ghost/Shadow Field Injection**: `{ "uid": "u1", ..., "isAdmin": true }` -> DENIED (`hasOnly` rejects unknown keys).
3. **PII Leak Attempt**: Authenticated `u2` calling `get` on `/users/u1/private/info` -> DENIED (`!isOwner`).
4. **Unverified Admin Email Spoofing**: Token with `email == "miqueiasmelouber@gmail.com"` and `email_verified: false` writing `/appConfig/monetization` -> DENIED (`isVerifiedUser()` fails).
5. **Non-Admin Privilege Escalation**: Regular user creating `/admins/{theirUid}` -> DENIED (`!isAdmin()`).
6. **Malicious AdSense Script/XSS Injection**: Admin payload with `adsense.clientId: "<script>alert(1)</script>"` -> DENIED (regex `^$|^ca-pub-[0-9]{10,20}$` rejects).
7. **Javascript URI in Catalog Item / Collection Alert**: `imageUrl: "javascript:alert(1)"` -> DENIED (regex `^(/src/assets/|https://).*$` rejects).
8. **Hidden Catalog Item Scraping**: Public user listing `/catalogItems` without filtering `isHidden == false` -> DENIED (`resource.data.isHidden == false`).
9. **Client-Forged Timestamp**: `{ ..., "createdAt": "2020-01-01T00:00:00Z" }` -> DENIED (`createdAt != request.time`).
10. **Immutable Field Mutation**: Update `/catalogItems/wp1` changing `createdBy` or `createdAt` -> DENIED.
11. **ID Poisoning**: Document ID `../../admin` or 500-char string -> DENIED (`isValidId`).
12. **Global User & Token Enumeration**: `list` on `/users`, `/appConfig`, or another user's `/pushSubscriptions` -> DENIED (`allow list: if false` / `resource.data.uid == request.auth.uid`).
13. **Unauthorized Push Broadcast**: Non-admin attempting `create` on `/collectionAlerts/alert1` -> DENIED (`!isAdmin()`).
