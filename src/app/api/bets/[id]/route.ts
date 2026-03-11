import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

// PATCH /api/bets/[id]
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await request.json();
        const { status } = body;

        if (!['pending', 'won', 'lost', 'void'].includes(status)) {
            return NextResponse.json({ error: "Invalid status value" }, { status: 400 });
        }

        const updatedBet = await prisma.bet.update({
            where: { id },
            data: { status }
        });

        return NextResponse.json({ success: true, message: "Status updated", bet: updatedBet });
    } catch (error: any) {
        console.error("PATCH Bet error:", error);
        if (error.code === 'P2025') {
            return NextResponse.json({ error: "Bet not found" }, { status: 404 });
        }
        return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
    }
}
