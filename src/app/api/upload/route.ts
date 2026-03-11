import { NextRequest, NextResponse } from "next/server";
import { OpenAI } from "openai";
import prisma from "@/lib/db";

// Parse JSON directly from API response
const parseAIResponse = (content: string) => {
    try {
        // Sometimes the model wraps JSON in markdown ```json ... ``` blocks
        const cleaned = content.replace(/```json/g, "").replace(/```/g, "").trim();
        return JSON.parse(cleaned);
    } catch (error) {
        console.error("Failed to parse AI response:", error);
        return null;
    }
};

export async function POST(req: NextRequest) {
    try {
        // Verify OpenAI API Key is available
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

        // Convert file to base64
        const buffer = await image.arrayBuffer();
        const base64Image = Buffer.from(buffer).toString("base64");
        const mimeType = image.type || "image/jpeg";

        const openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });

        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: `You are an AI that extracts sports betting data from screenshots. 
Extract the following information and return ONLY a valid JSON object with no markdown formatting.
Required JSON format:
{
  "date": "YYYY-MM-DD",
  "selections": [
    {
      "match": "Team A vs Team B",
      "selection": "Team A to win",
      "odds": 1.5
    }
  ],
  "odds": 2.5,
  "stake": 100.0,
  "potential_return": 250.0
}
If any information is unreadable, make your best guess or set it to a reasonable default (e.g., stake 0 if not found).`
                },
                {
                    role: "user",
                    content: [
                        { type: "text", text: "Please extract the bet details from this screenshot." },
                        {
                            type: "image_url",
                            image_url: {
                                url: `data:${mimeType};base64,${base64Image}`,
                                detail: "high"
                            }
                        }
                    ]
                }
            ],
            max_tokens: 1000,
            temperature: 0,
        });

        const aiContent = response.choices[0]?.message?.content;
        if (!aiContent) {
            throw new Error("No content returned from OpenAI");
        }

        const betData = parseAIResponse(aiContent);

        if (!betData) {
            return NextResponse.json({ error: "Failed to parse AI output into valid bet data format." }, { status: 500 });
        }

        // Insert into DB using Prisma
        const newBet = await prisma.bet.create({
            data: {
                date: betData.date || new Date().toISOString().split('T')[0],
                selections: betData.selections || [],
                odds: betData.odds || 1.0,
                stake: betData.stake || 0.0,
                potential_return: betData.potential_return || 0.0,
                status: 'pending'
            }
        });

        return NextResponse.json({
            success: true,
            id: newBet.id,
            message: "Bet successfully tracked!"
        });

    } catch (error: any) {
        console.error("Upload error:", error);
        return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
    }
}
