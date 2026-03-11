import { NextRequest, NextResponse } from "next/server";
import { OpenAI } from "openai";
import prisma from "@/lib/db";

// Parse JSON array from AI response safely
const parseAIResponse = (content: string) => {
    try {
        const cleaned = content.replace(/```json/g, "").replace(/```/g, "").trim();
        const parsed = JSON.parse(cleaned);
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
- If the screenshot already shows the outcome (e.g. "Won", "Lost", "Vundet", "Tabt"), set "status" to "won" or "lost". Otherwise use "pending".
- For Betfair bets: "profit" = the net amount shown in the result column (positive for wins, negative for losses). For a loss, set profit to -stake.
- For pending bets: set profit to 0.
- "sport": detect the sport from context. Common values: "Horse Racing", "Football", "Tennis", "Basketball", "Golf", "Cricket", "Other".
- "market": detect the market type. Common values: "Win", "Each Way", "Match Winner", "Over/Under", "Handicap", "Both Teams to Score", "Correct Score", "Outright", "Place", "Other".

Required format for each element:
{
  "date": "YYYY-MM-DD",
  "sport": "Horse Racing",
  "market": "Win",
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

// Send a simple text message back to the Telegram user
async function sendTelegramMessage(chatId: number, text: string) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return;

    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            chat_id: chatId,
            text: text,
            parse_mode: "Markdown"
        }),
    });
}

export const maxDuration = 60;

export async function POST(req: NextRequest) {
    let chatIdForError: number | undefined;
    try {
        const body = await req.json();

        if (!body.message) {
            return NextResponse.json({ success: true });
        }

        const { chat, photo, text } = body.message;
        const chatId = chat.id;
        chatIdForError = chatId;

        const allowedUserId = process.env.TELEGRAM_ALLOWED_USER_ID;
        if (allowedUserId && chatId.toString() !== allowedUserId) {
            console.log(`Unauthorized message from user ID: ${chatId}`);
            return NextResponse.json({ success: true });
        }

        if (!photo || photo.length === 0) {
            if (text === "/start") {
                await sendTelegramMessage(chatId, "Welcome to Bet Tracker Pro! 📸 Send me a screenshot of your betslip or Betfair history, and I'll automatically parse and track everything.");
            } else {
                await sendTelegramMessage(chatId, "Please send a screenshot of a betslip or Betfair bet history.");
            }
            return NextResponse.json({ success: true });
        }

        const fileId = photo[photo.length - 1].file_id;
        const token = process.env.TELEGRAM_BOT_TOKEN;

        if (!token || !process.env.OPENAI_API_KEY) {
            await sendTelegramMessage(chatId, "System error: API keys are not fully configured.");
            return NextResponse.json({ error: "Missing keys" }, { status: 200 });
        }

        await sendTelegramMessage(chatId, "Analyzing screenshot... ✨");

        // 1. Get file path from Telegram
        const fileRes = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
        const fileData = await fileRes.json();

        if (!fileData.ok) throw new Error("Failed to get file path from Telegram");

        const filePath = fileData.result.file_path;

        // 2. Download image from Telegram
        const imageRes = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`);
        const arrayBuffer = await imageRes.arrayBuffer();
        const base64Image = Buffer.from(arrayBuffer).toString("base64");

        // 3. Send image to OpenAI Vision
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const aiResponse = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
                {
                    role: "user",
                    content: [
                        { type: "text", text: "Please extract all bets from this screenshot." },
                        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Image}`, detail: "high" } }
                    ]
                }
            ],
            max_tokens: 2000,
            temperature: 0,
        });

        const aiContent = aiResponse.choices[0]?.message?.content;
        if (!aiContent) throw new Error("No content returned from OpenAI");

        const betsData = parseAIResponse(aiContent);
        if (!betsData || betsData.length === 0) {
            await sendTelegramMessage(chatId, "❌ Failed to parse the screenshot. Please try a clearer image.");
            return NextResponse.json({ success: true });
        }

        // 4. Save each bet to DB
        await Promise.all(
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
                        sport: betData.sport || 'Other',
                        market: betData.market || 'Other',
                    }
                })
            )
        );

        // 5. Build reply
        const wonCount = betsData.filter((b: any) => b.status === 'won').length;
        const lostCount = betsData.filter((b: any) => b.status === 'lost').length;
        const pendingCount = betsData.filter((b: any) => b.status === 'pending').length;

        let statusSummary = '';
        if (wonCount) statusSummary += `✅ Won: ${wonCount}  `;
        if (lostCount) statusSummary += `❌ Lost: ${lostCount}  `;
        if (pendingCount) statusSummary += `⏳ Pending: ${pendingCount}`;

        const replyText = `📊 *${betsData.length} bet(s) tracked!*\n\n${statusSummary.trim()}\n\nCheck your dashboard for the full overview!`;

        await sendTelegramMessage(chatId, replyText);
        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error("Telegram Webhook Error:", error);
        if (chatIdForError) {
            await sendTelegramMessage(chatIdForError, `❌ Fejl: Noget gik galt under behandlingen af dit screenshot (\`${error.message}\`). Prøv venligst igen!`);
        }
        return NextResponse.json({ error: error.message }, { status: 200 });
    }
}
