import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const zones = await prisma.deliveryZone.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ data: zones });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Алдаа гарлаа" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const zone = await prisma.deliveryZone.create({
      data: {
        name: body.name,
        description: body.description,
        fee: parseFloat(body.fee ?? "0"),
        boundaries: body.boundaries,
        isActive: body.isActive ?? true,
      },
    });

    return NextResponse.json(zone, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Алдаа гарлаа" }, { status: 500 });
  }
}
