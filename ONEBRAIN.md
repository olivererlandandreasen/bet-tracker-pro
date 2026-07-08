# Onebrain — Bet Tracker Pro

Fælles videns-dokument for projektet. Claude læser denne fil ved starten af hver session
og opdaterer den via **graphify** inden hver opgave afsluttes.

## Projektoverblik

Bet Tracker Pro er en Next.js-app (App Router) med Prisma/PostgreSQL, der tracker
sports-bets. Bets kommer ind via screenshots sendt til en Telegram-bot; en AI parser
screenshottet til strukturerede bets, som gemmes, merges og auto-resolves. Dashboardet
viser analytics, P&L-graf og en tabel med filtrering, redigering og sletning.

Nøglefiler:

- `src/app/api/telegram-webhook/route.ts` — modtager screenshots fra Telegram
- `src/lib/betHelpers.ts` — AI system-prompt, parsing, merge/auto-resolve-logik (`upsertBet`)
- `src/app/page.tsx` — dashboard (analytics, P&L-chart, tabel)
- `prisma/schema.prisma` — `Bet`-modellen (selections som JSON, sport/market/status/profit)

---

## Graphify

> Videns-graf over gemte emner. Hvert emne er en node; **Relationer** peger på andre
> emner i tabellen. Opdateres af graphify-skill'en (`.claude/skills/graphify/`) i
> slutningen af hver session — se CLAUDE.md for reglen.

### Emne-indeks

| Emne | Kategori | Relationer | Beslutning / viden | Sidst opdateret |
|---|---|---|---|---|
| Telegram-webhook | Integration | AI-screenshot-parsing, Fejlhåndtering | Screenshots sendes til bot; webhook svarer altid 200 OK (også ved fejl) for at undgå endeløse retries; max duration 60s | 2026-07-08 |
| AI-screenshot-parsing | AI | Telegram-webhook, Betfair-support, Sport/market-detektion | AI returnerer JSON-array med ét element pr. bet; fuldskærms-screenshots understøttes (ignorér irrelevant UI); status sættes fra synligt udfald (Won/Lost/Vundet/Tabt) | 2026-07-08 |
| Bet-merging | Kernelogik | AI-screenshot-parsing, Auto-resolve | Match på selections + dato — krav om eksakte odds er droppet; settled-on-settled merges også; ellers oprettes nyt bet (`upsertBet` i betHelpers) | 2026-07-08 |
| Auto-resolve | Kernelogik | Bet-merging | Pending bets resolves automatisk, når et settled screenshot af samme bet modtages | 2026-07-08 |
| Betfair-support | Integration | AI-screenshot-parsing | Multi-bet arrays fra exchange-historik; profit = nettobeløb i resultatkolonnen, tab = -stake | 2026-07-08 |
| Sport/market-detektion | Kernelogik | AI-screenshot-parsing, Dashboard | AI detekterer sport og market pr. bet; vises som badges pr. kort med filterbar og breakdown-tabel | 2026-07-08 |
| Dashboard | UI | Sport/market-detektion, Bet-redigering | Fuldt visuelt redesign: analytics-layout, P&L-chart, tabelvisning | 2026-07-08 |
| Bet-redigering | UI | Dashboard | Edit-modal og delete-funktion for alle bets (`api/bets/[id]`) | 2026-07-08 |
| Database & deploy | Infrastruktur | — | Prisma mod PostgreSQL (`DATABASE_URL`); `prisma db push` køres før build, så skemaet auto-migreres ved deploy | 2026-07-08 |
| Graphify & onebrain | Proces | — | Onebrain oprettet med graphify-sektion; graphify-skill + CLAUDE.md-regel sikrer, at emner gemmes efter hver session | 2026-07-08 |

### Sådan læses grafen

- **Emne**: nodens navn — kort og genkendeligt, genbruges i Relationer-kolonnen.
- **Kategori**: Kernelogik, Integration, UI, AI, Infrastruktur eller Proces.
- **Relationer**: kanter til andre emner i indekset.
- **Beslutning / viden**: essensen — hvad vi besluttede eller lærte, ikke hvordan koden ser ud.

### Log

| Dato | Session/opgave | Emner tilføjet/opdateret |
|---|---|---|
| 2026-07-08 | Graphify + onebrain-setup | Alle emner seedet fra git-historik og kodebase |
