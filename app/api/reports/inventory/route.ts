import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { InventoryReportSection, Prisma } from "@prisma/client";
import { z } from "zod";

const createItemSchema = z.object({
  section: z.nativeEnum(InventoryReportSection),
  productId: z.string().min(1),
});

const updateItemSchema = z.object({
  id: z.string().min(1),
  unitPrice: z.coerce.number().min(0),
});

const deleteItemSchema = z.object({
  id: z.string().min(1),
});

function toNumber(value: Prisma.Decimal | number | string | null | undefined): number {
  if (value == null) return 0;
  return Number(value);
}

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "ADMIN") {
    return null;
  }

  return session;
}

function mapProduct(product: {
  id: string;
  name: string;
  status: string;
  inventory: { quantity: number } | null;
  driverStocks: Array<{ quantity: number }>;
}) {
  const stockQty = (product.inventory?.quantity ?? 0)
    + product.driverStocks.reduce((sum, stock) => sum + Number(stock.quantity ?? 0), 0);

  return {
    id: product.id,
    name: product.name,
    status: product.status,
    stockQty,
  };
}

function mapReportItem(item: {
  id: string;
  section: InventoryReportSection;
  unitPrice: Prisma.Decimal;
  product: {
    id: string;
    name: string;
    status: string;
    inventory: { quantity: number } | null;
    driverStocks: Array<{ quantity: number }>;
  };
}) {
  const product = mapProduct(item.product);
  const unitPrice = toNumber(item.unitPrice);

  return {
    id: item.id,
    section: item.section,
    productId: product.id,
    productName: product.name,
    productStatus: product.status,
    stockQty: product.stockQty,
    unitPrice,
    totalAmount: product.stockQty * unitPrice,
  };
}

export async function GET() {
  try {
    const session = await requireAdmin();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const [products, reportItems] = await Promise.all([
      prisma.product.findMany({
        select: {
          id: true,
          name: true,
          status: true,
          inventory: { select: { quantity: true } },
          driverStocks: { select: { quantity: true } },
        },
        orderBy: { name: "asc" },
      }),
      prisma.inventoryReportItem.findMany({
        include: {
          product: {
            select: {
              id: true,
              name: true,
              status: true,
              inventory: { select: { quantity: true } },
              driverStocks: { select: { quantity: true } },
            },
          },
        },
        orderBy: [
          { section: "asc" },
          { createdAt: "asc" },
        ],
      }),
    ]);

    const mappedItems = reportItems.map(mapReportItem);

    return NextResponse.json({
      products: products.map(mapProduct),
      sections: {
        ACTIVE: mappedItems.filter((item) => item.section === "ACTIVE"),
        INACTIVE: mappedItems.filter((item) => item.section === "INACTIVE"),
      },
    });
  } catch (error) {
    console.error("Inventory report GET error:", error);
    return NextResponse.json({ error: "Алдаа гарлаа" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAdmin();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const body = await req.json();
    const parsed = createItemSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Мэдээлэл буруу байна" }, { status: 400 });
    }

    const { section, productId } = parsed.data;

    const item = await prisma.inventoryReportItem.upsert({
      where: {
        section_productId: {
          section,
          productId,
        },
      },
      update: {},
      create: {
        section,
        productId,
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            status: true,
            inventory: { select: { quantity: true } },
            driverStocks: { select: { quantity: true } },
          },
        },
      },
    });

    return NextResponse.json({ item: mapReportItem(item) }, { status: 201 });
  } catch (error) {
    console.error("Inventory report POST error:", error);
    return NextResponse.json({ error: "Алдаа гарлаа" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireAdmin();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const body = await req.json();
    const parsed = updateItemSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Мэдээлэл буруу байна" }, { status: 400 });
    }

    const item = await prisma.inventoryReportItem.update({
      where: { id: parsed.data.id },
      data: {
        unitPrice: new Prisma.Decimal(parsed.data.unitPrice),
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            status: true,
            inventory: { select: { quantity: true } },
            driverStocks: { select: { quantity: true } },
          },
        },
      },
    });

    return NextResponse.json({ item: mapReportItem(item) });
  } catch (error) {
    console.error("Inventory report PATCH error:", error);
    return NextResponse.json({ error: "Алдаа гарлаа" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await requireAdmin();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const body = await req.json();
    const parsed = deleteItemSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Мэдээлэл буруу байна" }, { status: 400 });
    }

    await prisma.inventoryReportItem.delete({
      where: { id: parsed.data.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Inventory report DELETE error:", error);
    return NextResponse.json({ error: "Алдаа гарлаа" }, { status: 500 });
  }
}