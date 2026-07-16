# Active Recall English Typer V2.0

Monorepo (npm workspaces):
- `packages/shared` - shared TypeScript types, zod schemas, SRS rule functions, vocab data (JSON)
- `server` - Express + Prisma + PostgreSQL backend (deployed on Render)
- `app` - Expo React Native app

## Design system
- Colors: cream `#fcf9f4` bg, `slate-900` text, `emerald-500` accent (positive), `indigo-600` accent (tech/secondary)
- Fonts: Outfit / Plus Jakarta Sans (headings), JetBrains Mono (typing + metrics)
- SRS: 5 memory boxes. Promote if time < 3.5s AND accuracy >= 95%. Demote if accuracy < 85% OR time > 6.5s.
- CEFR tracks: A1-A2 (Beginner), B1-B2 (Intermediate), C1-C2 (Advanced)
- Vocab source: Oxford 3000 (A1-B2) + Oxford 5000 (B2-C1 extra) PDFs in repo root. No official Oxford C2 list - hand-authored supplement needed.
