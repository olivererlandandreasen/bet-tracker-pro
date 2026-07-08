---
name: graphify
description: Gem sessionens emner, beslutninger og viden som noder og relationer i ONEBRAIN.md's Graphify-sektion. SKAL bruges i slutningen af enhver session/opgave i dette repo, der har tilført ny viden (feature, bugfix, beslutning, læring). Trigger også når brugeren siger "graphify", "gem emnet", "opdater onebrain" eller spørger hvilke emner der er gemt.
---

# Graphify

Formål: ONEBRAIN.md er projektets fælles hukommelse. Graphify holder dens
**Graphify-sektion** ajour, så brugeren altid kan se, hvilke emner der er gemt,
og hvordan de hænger sammen.

## Hvornår

- **Hver gang** en opgave afsluttes, som har tilført ny viden: ny feature, bugfix
  med en læring, arkitektur-/produktbeslutning, ændret adfærd.
- Når brugeren eksplicit beder om det ("graphify det her", "gem emnet").
- Spring KUN over ved rene spørgsmål/opslag uden ny viden.

## Fremgangsmåde

1. Læs `ONEBRAIN.md` (repo-roden).
2. Udtræk sessionens emner: hvad blev besluttet, bygget eller lært? Formulér hvert
   emne som en node med et kort, genkendeligt navn.
3. Opdater **Emne-indekset**:
   - Eksisterende emne → opdater "Beslutning / viden" og "Sidst opdateret".
   - Nyt emne → tilføj en række med Kategori (Kernelogik, Integration, UI, AI,
     Infrastruktur, Proces) og Relationer til eksisterende emner.
   - Relationer skal pege på emnenavne, der findes i tabellen.
4. Tilføj én række i **Log**-tabellen: dato, kort opgavebeskrivelse, berørte emner.
5. Skriv på dansk. Gem essensen (beslutningen/læringen), ikke kode-detaljer.
6. Commit ONEBRAIN.md sammen med sessionens øvrige ændringer.

## Kvalitetskrav

- Ingen dubletter: genbrug eksisterende noder frem for at oprette nye med lignende navne.
- Hold "Beslutning / viden" til 1-2 sætninger — det er et indeks, ikke dokumentation.
- Datoen skal være dags dato for de rækker, der ændres.
