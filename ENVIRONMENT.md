Environment variables (Vite)

This project uses Vite. Client-side environment variables must be prefixed with `VITE_`.

Setup steps (local):

1. Copy `.env.example` to `.env.local`:

   cp .env.example .env.local

   On Windows PowerShell:

   Copy-Item .env.example .env.local

2. Fill the values in `.env.local` (you likely have the Firebase values already).

3. Restart the dev server if it's running.

Security note: Keep `.env.local` out of version control. The `.env.example` is safe to commit and documents required keys.
