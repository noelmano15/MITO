# MITO Platform — Firestore Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. **Default Deny & Server Authority**: All sensitive collections (`users`, `gameAnswerKeys`, `activeSessions`, `auditLogs`, `accessPolicies`) are server-only and denied to direct client SDK reads/writes.
2. **Admin Verification**: Only a verified administrator (`exists(/databases/$(database)/documents/admins/$(request.auth.uid))` or verified bootstrapped admin email) can create, update, or delete `/content/{contentId}`.
3. **Strict Schema & Size Bounds**: Every string field enforces strict `.size()` bounds and ID regex `^[a-zA-Z0-9_\-]+$`.
4. **Temporal & Identity Integrity**: `createdAt` and `updatedAt` must equal `request.time`; `createdAt`, `userId`, `contentId`, and `authorUid` are immutable after creation.
5. **Query Enforcer on List**: `allow list` on `/playbackProgress` strictly enforces `resource.data.userId == request.auth.uid`. `allow list` on `/content` strictly enforces `resource.data.publicationStatus == 'published'`.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Shadow Field Injection on Content**: Adding `{"isFeaturedHack": true}` to `/content/{contentId}` -> Rejected by `data.keys().hasOnly(...)`.
2. **Unverified Admin Email Spoof**: Request with `request.auth.token.email == 'noelmano963@gmail.com'` but `email_verified == false` -> Rejected by `request.auth.token.email_verified == true`.
3. **Cross-User Progress Read (PII/Progress Leak)**: Authenticated user `user_A` reading `/playbackProgress/prog_B` where `resource.data.userId == 'user_B'` -> Rejected by `existing().userId == request.auth.uid`.
4. **Blanket List Scraping on Progress**: Client querying `/playbackProgress` without `where('userId', '==', uid)` -> Rejected by `allow list` checking `resource.data.userId == request.auth.uid`.
5. **Draft Content Leak**: Client querying `/content` for `publicationStatus == 'draft'` without admin role -> Rejected by `resource.data.publicationStatus == 'published'`.
6. **ID Poisoning Attack**: Creating a document with a 500-char or special-char ID -> Rejected by `isValidId(id)`.
7. **Value Poisoning on Update**: Updating `watchedSeconds` on `/playbackProgress/{progressId}` with a string `"999999"` -> Rejected by `isValidUserProgress(incoming())` wrapping the update block.
8. **Immutable Field Mutation**: Attempting to change `createdAt` or `userId` on `/playbackProgress/{progressId}` during update -> Rejected by `incoming().createdAt == existing().createdAt && incoming().userId == existing().userId`.
9. **Forged Client Timestamp**: Submitting a past or future `createdAt` or `updatedAt` instead of `request.time` -> Rejected by `incoming().createdAt == request.time`.
10. **Self-Admin Promotion**: Authenticated user attempting to write `/admins/{uid}` -> Rejected (`allow write: if false;` on `/admins/{adminId}`).
11. **Orphaned Progress Creation**: Creating `/playbackProgress/{progressId}` referencing a non-existent `contentId` -> Rejected by `exists(/databases/$(database)/documents/content/$(incoming().contentId))`.
12. **Terminal State / Archive Mutation**: Non-admin attempting to mutate archived content -> Rejected by admin-only write gate and terminal state check.
