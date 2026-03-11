import { NextResponse } from "next/server";
import prisma from "@/lib/db";

export async function GET() {
    try {
        const bets = await prisma.bet.findMany({
            orderBy: {
                createdAt: 'desc'
            }
        });

        return NextResponse.json({ bets });
    } catch (error: any) {
        console.error("GET Bets error:", error);
        return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
    }
}
