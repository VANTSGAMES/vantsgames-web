# VANTS GAMES Firestore Security Specification

## 1. Security Model & Isolation
- All Firestore collections are strictly scoped under `/users/{userId}/...` where `{userId}` MUST equal `request.auth.uid`.
- No public listing of user profiles, AI sessions, voice notes, or saved arena check-ins.
- Every access requires a verified Firebase Auth account (`request.auth != null && request.auth.token.email_verified == true`).
- Catch-all rule `match /{document=**}` defaults to `allow read, write: if false;`.

## 2. Dirty Dozen Audit
1. **Default-Deny Catch-All**: Enforced at top of database block.
2. **Email Verification**: Enforced on every read and write via `isVerifiedUser()`.
3. **Strict Path & Ownership Binding**: `isOwner(userId)` binds path `{userId}` to `request.auth.uid`, and `ownerId` inside document data must equal `userId` on create and remain immutable on update.
4. **Document ID Validation**: `isValidId(id)` constrains IDs to `^[a-zA-Z0-9_-]{1,128}$`.
5. **Exact Schema Whitelisting**: `keys().hasOnly(...)` and `keys().hasAll(...)` on create; `affectedKeys().hasOnly(...)` on update prevent mass-assignment or arbitrary field injection.
6. **Type & Size Bounds**: Every string has explicit min/max length bounds; `messageCount` bounded `[1, 200]`; `durationSec` bounded `[0, 600]`.
7. **Enum Enforcement**: `model` and `mode` validated against strict allowlists.
8. **Server Timestamps**: `createdAt == request.time` on create (immutable on update); `updatedAt == request.time` on create and update.
9. **Google Maps Compliance**: `arena_spots` stores only `placeId` + user-authored `userLabel`/`userNote`/`gameSlug`, never cached Google Maps place fields.
10. **No Client Privilege Escalation**: No `role` or `isAdmin` fields exist on client-writable documents.
11. **Delete Protection**: Owner-only delete verified against `isOwner(userId)` and `resource.data.ownerId == userId`.
12. **No Cross-User Queries**: All collections live exclusively inside `/users/{userId}/...`, preventing accidental collection-wide PII leaks.
