import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";

export async function GET(req: NextRequest) {
  try {
    const assignments = await prisma.deliveryAssignment.findMany({
      include: {
        order: { include: { customer: true } },
        agent: { include: { user: true } },
        zone: true,
        timeSlot: true,
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    return NextResponse.json({ data: assignments });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Алдаа гарлаа" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const assignment = await prisma.deliveryAssignment.create({
      data: {
        orderId: body.orderId,
        agentId: body.agentId,
        zoneId: body.zoneId,
        timeSlotId: body.timeSlotId,
        status: "ASSIGNED",
        trackingCode: `TRK-${uuidv4().substring(0, 8)}`,
      },
      include: {
        order: { include: { customer: true } },
        agent: { include: { user: true } },
        zone: true,
      },
    });

    return NextResponse.json(assignment, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Алдаа гарлаа" }, { status: 500 });
  }
}
