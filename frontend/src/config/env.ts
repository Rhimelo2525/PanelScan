/**
 * Frontend environment configuration.
 *
 * Uses Expo's built-in EXPO_PUBLIC_* env var support (no extra dependency needed —
 * supported natively by the Expo/Metro toolchain since SDK 49). Values are read from
 * `.env` at build time; see frontend/.env.example for the full list and
 * frontend/README.md's "Environment configuration" section for setup instructions.
 */

/** Backend API base URL. Local dev backend defaults to http://localhost:4000 (backend/README.md §5). */
export const API_BASE_URL: string = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';
