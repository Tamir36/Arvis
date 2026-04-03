import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { StockMovementType } from "@prisma/client";
import { z } from "zod";

interface Params {
  id: string;
}

const stockAdjustSchema = z.object({
  action: z.enum(["IN", "OUT"]),
  quantity: z.coerce.number().int().positive(),
  note: z.string().optional(),
});

export async function POST(req: NextRequest, { params }: { params: Params }) {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN") {
      return NextResponse.json({ error: "Хандах эрх байхгүй" }, { status: 403 });
    }

    const body = await req.json();
    const parsed = stockAdjustSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Буруу өгөгдөл" }, { status: 400 });
    }

    const { action, quantity, note } = parsed.data;

    const result = await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: params.id },
        include: { inventory: true },
      });

      if (!product) {
        throw new Error("PRODUCT_NOT_FOUND");
      }

      const beforeQty = product.inventory?.quantity ?? 0;
      const delta = action === "IN" ? quantity : -quantity;
      const afterQty = beforeQty + delta;

      if (afterQty < 0) {
        throw new Error("INSUFFICIENT_STOCK");
      }

      const inventory = await tx.inventory.upsert({
        where: { productId: product.id },
        update: { quantity: afterQty },
        create: {
          productId: product.id,
          quantity: afterQty,
        },
      });

      const movement = await tx.stockMovement.create({
        data: {
          productId: product.id,
          userId: session.user?.id,
          type: action as StockMovementType,
          quantity,
          beforeQty,
          afterQty,
          note,
        },
        include: {
          user: { select: { id: true, name: true } },
        },
      });

      return { inventory, movement };
    });

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "PRODUCT_NOT_FOUND") {
        return NextResponse.json({ error: "Бараа олдсонгүй" }, { status: 404 });
      }
      if (err.message === "INSUFFICIENT_STOCK") {
        return NextResponse.json({ error: "Үлдэгдэл хүрэлцэхгүй" }, { status: 400 });
      }
    }

    console.error(err);
    return NextResponse.json({ error: "Алдаа гарлаа" }, { status: 500 });
  }
}
