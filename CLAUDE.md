# Bet Tracker Pro — instruktioner til Claude

## Onebrain & graphify (obligatorisk)

- `ONEBRAIN.md` i repo-roden er projektets fælles hukommelse. **Læs den ved starten
  af hver session**, før du arbejder på en opgave.
- **Brug graphify hver gang**: I slutningen af enhver opgave, der har tilført ny viden
  (feature, bugfix, beslutning, læring), SKAL du køre graphify-skill'en
  (`.claude/skills/graphify/SKILL.md`) og opdatere Graphify-sektionen i `ONEBRAIN.md`
  — emne-indekset og loggen — og committe den sammen med de øvrige ændringer.
- Spring kun over ved rene spørgsmål/opslag uden ny viden.
- Skriv onebrain-indhold på dansk.

## Projekt

- Next.js (App Router) + Prisma/PostgreSQL. Bets kommer ind via Telegram-webhook
  med AI-parsing af screenshots — se ONEBRAIN.md for arkitektur og beslutninger.
