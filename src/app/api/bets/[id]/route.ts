import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

// PATCH /api/bets/[id] — update any bet fields
export async function PATCH(req: NextRequest, { params }: Params) {
    try {
        const { id } = await params;
        const body = await req.json();

        // Build a dynamic update payload — only include fields that were sent
        const data: Record<string, any> = {};

        if (body.status !== undefined) {
            if (!['pending', 'won', 'lost', 'void'].includes(body.status)) {
                return NextResponse.json({ error: "Invalid status" }, { status: 400 });
            }
            data.status = body.status;
        }
        if (body.date !== undefined) data.date = body.date;
        if (body.odds !== undefined) data.odds = Number(body.odds);
        if (body.stake !== undefined) data.stake = Number(body.stake);
        if (body.potential_return !== undefined) data.potential_return = Number(body.potential_return);
        if (body.profit !== undefined) data.profit = Number(body.profit);
        if (body.sport !== undefined) data.sport = body.sport;
        if (body.market !== undefined) data.market = body.market;
        if (body.selections !== undefined) data.selections = body.selections;

        const updated = await prisma.bet.update({ where: { id }, data });
        return NextResponse.json({ success: true, bet: updated });
    } catch (error: any) {
        if (error.code === 'P2025') return NextResponse.json({ error: "Not found" }, { status: 404 });
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// DELETE /api/bets/[id]
export async function DELETE(_req: NextRequest, { params }: Params) {
    try {
        const { id } = await params;
        await prisma.bet.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (error: any) {
        if (error.code === 'P2025') return NextResponse.json({ error: "Not found" }, { status: 404 });
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
