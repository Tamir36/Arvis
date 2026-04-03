import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const products = await prisma.product.findMany({
      include: {
        category: true,
        inventory: true,
        driverStocks: { select: { quantity: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    // Convert to CSV
    const headers = ["ID", "Нэр", "Ангилал", "Үнэ", "Нөөц", "Статус"];
    const rows = products.map((p) => [
      p.id,
      p.name,
      p.category?.name ?? "",
      p.basePrice,
      (p.inventory?.quantity ?? 0) + p.driverStocks.reduce((sum, stock) => sum + stock.quantity, 0),
      p.status,
    ]);

    const csv = [headers, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="products-${Date.now()}.csv"`,
      },
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Алдаа гарлаа" }, { status: 500 });
  }
}
