import { NextRequest, NextResponse } from "next/server";
import { OpenAI } from "openai";
import { parseAIResponse, SYSTEM_PROMPT, upsertBet } from "@/lib/betHelpers";

export async function POST(req: NextRequest) {
    try {
        if (!process.env.OPENAI_API_KEY) {
            return NextResponse.json(
                { error: "OpenAI API key not configured." },
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

        // Upsert each bet (create new or merge duplicate)
        const results = await Promise.all(betsData.map((b: any) => upsertBet(b)));
        const created = results.filter(r => r.action === 'created').length;
        const merged = results.filter(r => r.action === 'merged').length;

        return NextResponse.json({
            success: true,
            count: results.length,
            message: `${created} new bet(s) tracked${merged > 0 ? `, ${merged} merged with existing` : ''}!`
        });

    } catch (error: any) {
        console.error("Upload error:", error);
        return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
    }
}
