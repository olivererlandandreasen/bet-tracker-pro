import { NextRequest, NextResponse } from "next/server";
import { OpenAI } from "openai";
import { parseAIResponse, SYSTEM_PROMPT, upsertBet } from "@/lib/betHelpers";

async function sendTelegramMessage(chatId: number, text: string) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return;
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
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

        // 2. Download image
        const imageRes = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`);
        const arrayBuffer = await imageRes.arrayBuffer();
        const base64Image = Buffer.from(arrayBuffer).toString("base64");

        // 3. Send to OpenAI Vision
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

        // 4. Upsert each bet (create new or merge duplicate stakes)
        const results = await Promise.all(betsData.map((b: any) => upsertBet(b)));
        const createdCount = results.filter(r => r.action === 'created').length;
        const mergedCount = results.filter(r => r.action === 'merged').length;

        const wonCount = betsData.filter((b: any) => b.status === 'won').length;
        const lostCount = betsData.filter((b: any) => b.status === 'lost').length;
        const pendingCount = betsData.filter((b: any) => b.status === 'pending').length;

        let statusSummary = '';
        if (wonCount) statusSummary += `✅ Won: ${wonCount}  `;
        if (lostCount) statusSummary += `❌ Lost: ${lostCount}  `;
        if (pendingCount) statusSummary += `⏳ Pending: ${pendingCount}`;

        let mergeNote = mergedCount > 0 ? `\n_(${mergedCount} stake(s) merged with existing bets)_` : '';
        const replyText = `📊 *${results.length} bet(s) tracked!*\n\n${statusSummary.trim()}${mergeNote}\n\nCheck your dashboard for the full overview!`;

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
