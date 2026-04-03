import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const drivers = await prisma.deliveryAgent.findMany({
      include: {
        user: { select: { id: true, name: true, phone: true, email: true } },
        _count: { select: { assignments: true } },
      },
    });

    return NextResponse.json({
      data: drivers.map((d) => ({
        ...d,
        assignmentCount: d._count.assignments,
      })),
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Алдаа гарлаа" }, { status: 500 });
  }
}
