import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

interface Params {
  id: string;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<Params> }) {
  try {
    const { id: orderId } = await params;

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Нэвтрэх шаардлагатай" }, { status: 401 });
    }

    const role = String(session.user.role ?? "").toUpperCase();
    if (role !== "DRIVER") {
      return NextResponse.json({ error: "Зөвхөн жолооч хандах боломжтой" }, { status: 403 });
    }

    const body = await req.json();
    const nextNote = String(body.note ?? "").trim();

    const order = await prisma.order.findFirst({
      where: {
        id: orderId,
        OR: [
          { assignedToId: session.user.id },
          {
            delivery: {
              is: {
                agent: {
                  is: {
                    userId: session.user.id,
                  },
                },
              },
            },
          },
        ],
      },
      select: { id: true },
    });

    if (!order) {
      return NextResponse.json({ error: "Захиалга олдсонгүй" }, { status: 404 });
    }

    if (!nextNote) {
      await prisma.orderDriverPrivateNote.deleteMany({
        where: {
          orderId,
          driverId: session.user.id,
        },
      });

      return NextResponse.json({ orderId, note: null });
    }

    const saved = await prisma.orderDriverPrivateNote.upsert({
      where: {
        orderId_driverId: {
          orderId,
          driverId: session.user.id,
        },
      },
      update: {
        note: nextNote,
      },
      create: {
        orderId,
        driverId: session.user.id,
        note: nextNote,
      },
      select: {
        orderId: true,
        note: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(saved);
  } catch (error) {
    console.error("PATCH /api/driver/deliveries/[id]/private-note failed", error);
    return NextResponse.json({ error: "Тэмдэглэл хадгалах үед алдаа гарлаа" }, { status: 500 });
  }
}
