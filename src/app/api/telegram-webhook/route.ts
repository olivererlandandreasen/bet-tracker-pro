import { NextRequest, NextResponse } from "next/server";
import { OpenAI } from "openai";
import prisma from "@/lib/db";

// Function to parse the AI JSON output safely
const parseAIResponse = (content: string) => {
    try {
        const cleaned = content.replace(/```json/g, "").replace(/```/g, "").trim();
        return JSON.parse(cleaned);
    } catch (error) {
        console.error("Failed to parse AI response:", error);
        return null;
    }
};

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

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();

        // Safety check for Telegram structure
        if (!body.message) {
            return NextResponse.json({ success: true }); // Acknowledge other types of updates quietly
        }

        const { chat, photo, text } = body.message;
        const chatId = chat.id;

        // Optional: Restrict to your own user ID for security
        const allowedUserId = process.env.TELEGRAM_ALLOWED_USER_ID;
        if (allowedUserId && chatId.toString() !== allowedUserId) {
            console.log(`Unauthorized message from user ID: ${chatId}`);
            return NextResponse.json({ success: true });
        }

        // Checking if the message contains an image (photo array)
        if (!photo || photo.length === 0) {
            if (text === "/start") {
                await sendTelegramMessage(chatId, "Welcome to Bet Tracker Pro! 📸 Send me a screenshot of your betslip, and I'll automatically parse and track it.");
            } else {
                await sendTelegramMessage(chatId, "Please send a screenshot of a betslip.");
            }
            return NextResponse.json({ success: true });
        }

        // Get the largest photo (highest resolution)
        const fileId = photo[photo.length - 1].file_id;
        const token = process.env.TELEGRAM_BOT_TOKEN;

        if (!token || !process.env.OPENAI_API_KEY) {
            await sendTelegramMessage(chatId, "System error: API keys are not fully configured.");
            return NextResponse.json({ error: "Missing keys" }, { status: 500 });
        }

        await sendTelegramMessage(chatId, "Analyzing screenshot... ✨");

        // 1. Get file path from Telegram
        const fileRes = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
        const fileData = await fileRes.json();

        if (!fileData.ok) {
            throw new Error("Failed to get file path from Telegram");
        }

        const filePath = fileData.result.file_path;

        // 2. Download the image file content directly from Telegram
        const imageRes = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`);
        const arrayBuffer = await imageRes.arrayBuffer();
        const base64Image = Buffer.from(arrayBuffer).toString("base64");

        // 3. Send image to OpenAI Vision
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const aiResponse = await openai.chat.completions.create({
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
If any information is unreadable, make your best guess or set it to a reasonable default.`
                },
                {
                    role: "user",
                    content: [
                        { type: "text", text: "Please extract the bet details from this screenshot." },
                        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Image}`, detail: "high" } }
                    ]
                }
            ],
            max_tokens: 1000,
            temperature: 0,
        });

        const aiContent = aiResponse.choices[0]?.message?.content;
        if (!aiContent) throw new Error("No content returned from OpenAI");

        const betData = parseAIResponse(aiContent);
        if (!betData) {
            await sendTelegramMessage(chatId, "❌ Failed to parse the screenshot. Please try a clearer image.");
            return NextResponse.json({ success: true });
        }

        // 4. Save to Database via Prisma
        await prisma.bet.create({
            data: {
                date: betData.date || new Date().toISOString().split('T')[0],
                selections: betData.selections || [],
                odds: betData.odds || 1.0,
                stake: betData.stake || 0.0,
                potential_return: betData.potential_return || 0.0,
                status: 'pending'
            }
        });

        // 5. Success reply
        const replyText = `✅ *Bet Tracked Successfully!*
    
*Stake:* $${betData.stake}
*Total Odds:* ${betData.odds}
*Potential Return:* $${betData.potential_return}

Check your dashboard to view the pending bet!`;

        await sendTelegramMessage(chatId, replyText);

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error("Telegram Webhook Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
