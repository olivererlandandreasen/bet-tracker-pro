import { NextRequest, NextResponse } from "next/server";
import { OpenAI } from "openai";
import prisma from "@/lib/db";

// Parse JSON array directly from API response
const parseAIResponse = (content: string) => {
    try {
        const cleaned = content.replace(/```json/g, "").replace(/```/g, "").trim();
        const parsed = JSON.parse(cleaned);
        // Support both a single object and an array
        return Array.isArray(parsed) ? parsed : [parsed];
    } catch (error) {
        console.error("Failed to parse AI response:", error);
        return null;
    }
};

const SYSTEM_PROMPT = `You are an AI that extracts sports betting data from screenshots.
Return ONLY a valid JSON array (no markdown, no extra text) where EACH ELEMENT is one individual bet.

IMPORTANT RULES:
- If the screenshot shows multiple individual bets/rows (e.g. Betfair exchange history), create ONE array element per row.
- If the screenshot shows a single combined betslip, return an array with ONE element.
- If the screenshot already shows the outcome (e.g. "Won", "Lost", "Vundet", "Tabt"), set "status" to "won" or "lost" accordingly. Otherwise use "pending".
- For Betfair bets: "profit" = the net amount shown in the result column (positive for wins, negative for losses). For a loss, set profit to -stake.
- For pending bets: set profit to 0.

Required format for each element:
{
  "date": "YYYY-MM-DD",
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
  "profit": -500.0,
  "status": "lost"
}`;

export async function POST(req: NextRequest) {
    try {
        if (!process.env.OPENAI_API_KEY) {
            return NextResponse.json(
                { error: "OpenAI API key not configured. Please add OPENAI_API_KEY to your environment." },
                { status: 500 }
            );
        }

        const formData = await req.formData();
        const image = formData.get("image") as File;

        if (!image) {
            return NextResponse.json({ error: "No image provided" }, { status: 400 });
        }

        const buffer = await image.arrayBuffer();
        const base64Image = Buffer.from(buffer).toString("base64");
        const mimeType = image.type || "image/jpeg";

        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
                {
                    role: "user",
                    content: [
                        { type: "text", text: "Please extract all bets from this screenshot." },
                        {
                            type: "image_url",
                            image_url: { url: `data:${mimeType};base64,${base64Image}`, detail: "high" }
                        }
                    ]
                }
            ],
            max_tokens: 2000,
            temperature: 0,
        });

        const aiContent = response.choices[0]?.message?.content;
        if (!aiContent) throw new Error("No content returned from OpenAI");

        const betsData = parseAIResponse(aiContent);
        if (!betsData || betsData.length === 0) {
            return NextResponse.json({ error: "Failed to parse AI output into valid bet data." }, { status: 500 });
        }

        // Create one DB record per bet
        const createdBets = await Promise.all(
            betsData.map((betData: any) =>
                prisma.bet.create({
                    data: {
                        date: betData.date || new Date().toISOString().split('T')[0],
                        selections: betData.selections || [],
                        odds: betData.odds || 1.0,
                        stake: betData.stake || 0.0,
                        potential_return: betData.potential_return || 0.0,
                        profit: betData.profit || 0.0,
                        status: ['won', 'lost', 'void'].includes(betData.status) ? betData.status : 'pending',
                    }
                })
            )
        );

        return NextResponse.json({
            success: true,
            count: createdBets.length,
            message: `${createdBets.length} bet(s) successfully tracked!`
        });

    } catch (error: any) {
        console.error("Upload error:", error);
        return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
    }
}
