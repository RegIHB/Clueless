# Post-launch small fixes tracker

Small, non-blocking follow-ups to keep separate from launch-critical security and stability work.

## Image and storage

- Move wardrobe item uploads from temporary compressed data URLs into Supabase Storage URLs.
- Move selfie/profile photos from data URLs into Supabase Storage URLs.
- Make the `try-on-results` bucket private and serve try-on images through signed URLs.
- Add cleanup for orphaned uploaded wardrobe/selfie/try-on images when items are deleted.

## API and infrastructure hardening

- Replace the in-process API rate limiter with a durable Redis, Upstash, or database-backed limiter.
- Add route-handler tests for auth and rate-limit behavior on costly APIs.
- Add webhook signature edge-case tests for malformed Lemon Squeezy signatures.

## UX polish

- Resolve the remaining `pnpm lint` warnings in `src/app/App.tsx`.
- Replace the try-on lightbox `<img>` with `next/image` or a documented custom loader.
- Add clearer UI copy explaining when item photos are temporary local uploads vs durable stored images.

## Maintenance

- Remove unused dependencies and generated UI components after a usage audit.
- Replace deprecated Next.js `middleware` convention with the newer proxy convention when convenient.
