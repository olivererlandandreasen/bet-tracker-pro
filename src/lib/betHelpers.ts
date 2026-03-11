import prisma from "@/lib/db";

// Parse JSON array from AI response safely
export const parseAIResponse = (content: string) => {
    try {
        const cleaned = content.replace(/```json/g, "").replace(/```/g, "").trim();
        const parsed = JSON.parse(cleaned);
        return Array.isArray(parsed) ? parsed : [parsed];
    } catch (error) {
        console.error("Failed to parse AI response:", error);
        return null;
    }
};

export const SYSTEM_PROMPT = `You are an AI that extracts sports betting data from screenshots.
Return ONLY a valid JSON array (no markdown, no extra text) where EACH ELEMENT is one individual bet.

IMPORTANT RULES:
- The screenshot may show an entire screen, a browser window, or multiple overlapping UI elements. Focus ONLY on visible bet slip or bet history data. Ignore toolbars, browsers, desktops, ads, and irrelevant UI.
- If the screenshot shows multiple individual bets/rows (e.g. Betfair exchange history or stacked betslips), create ONE array element per bet/row.
- If the screenshot shows a single combined betslip, return an array with ONE element.
- If the screenshot already shows the outcome (e.g. "Won", "Lost", "Vundet", "Tabt"), set "status" to "won" or "lost". Otherwise use "pending".
- For Betfair bets: "profit" = the net amount shown in the result column (positive for wins, negative for losses). For a loss, set profit to -stake.
- For pending bets: set profit to 0.
- "sport": detect the sport from context. Common values: "Horse Racing", "Football", "Tennis", "Basketball", "Golf", "Cricket", "Other".
- "market": detect the market type. Common values: "Win", "Each Way", "Match Winner", "Over/Under", "Handicap", "Both Teams to Score", "Correct Score", "Outright", "Place", "Other".

Required format for each element:
{
  "date": "YYYY-MM-DD",
  "sport": "Football",
  "market": "Match Winner",
  "selections": [
    {
      "match": "Event or race name",
      "selection": "Horse or team selected",
      "odds": 3.9
    }
  ],
  "odds": 3.9,
  "stake": 500.0,
  "potential_return": 1950.0,
  "profit": 0,
  "status": "pending"
}`;

/**
 * For each parsed bet:
 * - Check if a pending bet already exists with same odds + overlapping selections.
 * - If yes: merge by adding stake & potential_return to the existing record.
 * - If no: create a new record.
 *
 * Returns an array of { action: 'created' | 'merged', id: string }.
 */
export async function upsertBet(betData: any): Promise<{ action: 'created' | 'merged' | 'resolved'; id: string }> {
    const incomingOdds = betData.odds || 1.0;
    const incomingSelections: Array<{ match: string; selection: string }> = betData.selections || [];
    const isSettled = betData.status === 'won' || betData.status === 'lost' || betData.status === 'void';

    // Find pending bets with the same odds (candidates for both merging & resolving)
    const candidates = await prisma.bet.findMany({
        where: { status: 'pending', odds: incomingOdds },
    });

    for (const candidate of candidates) {
        const existingSelections = candidate.selections as Array<{ match: string; selection: string }>;

        const matches = incomingSelections.filter(inc =>
            existingSelections.some(ex =>
                normalise(ex.match) === normalise(inc.match) &&
                normalise(ex.selection) === normalise(inc.selection)
            )
        );

        if (matches.length > 0 && matches.length >= Math.ceil(incomingSelections.length / 2)) {
            if (isSettled) {
                // Resolve the pending bet with the result from the new screenshot
                const profit = betData.profit || (betData.status === 'won'
                    ? candidate.potential_return - candidate.stake
                    : -candidate.stake);

                const updated = await prisma.bet.update({
                    where: { id: candidate.id },
                    data: {
                        status: betData.status,
                        profit,
                    },
                });
                return { action: 'resolved', id: updated.id };
            } else {
                // Merge: add stake and potential_return
                const updated = await prisma.bet.update({
                    where: { id: candidate.id },
                    data: {
                        stake: candidate.stake + (betData.stake || 0),
                        potential_return: candidate.potential_return + (betData.potential_return || 0),
                    },
                });
                return { action: 'merged', id: updated.id };
            }
        }
    }

    // No matching pending bet found — create new record
    const created = await prisma.bet.create({ data: buildData(betData) });
    return { action: 'created', id: created.id };
}

function normalise(text: string = ''): string {
    return text.toLowerCase().trim().replace(/\s+/g, ' ');
}

function buildData(betData: any) {
    return {
        date: betData.date || new Date().toISOString().split('T')[0],
        selections: betData.selections || [],
        odds: betData.odds || 1.0,
        stake: betData.stake || 0.0,
        potential_return: betData.potential_return || 0.0,
        profit: betData.profit || 0.0,
        status: ['won', 'lost', 'void'].includes(betData.status) ? betData.status : 'pending',
        sport: betData.sport || 'Other',
        market: betData.market || 'Other',
    };
}
