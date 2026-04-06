import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const META_CACHE_TTL_MS = 30_000;

type OrdersMetaPayload = {
  drivers: Array<{ id: string; name: string }>;
  products: Array<{ id: string; name: string; basePrice: unknown }>;
};

let metaCache: { expiresAt: number; payload: OrdersMetaPayload } | null = null;
let metaInFlight: Promise<OrdersMetaPayload> | null = null;

async function loadOrdersMeta(): Promise<OrdersMetaPayload> {
  const now = Date.now();
  if (metaCache && metaCache.expiresAt > now) {
    return metaCache.payload;
  }

  if (metaInFlight) {
    return metaInFlight;
  }

  metaInFlight = (async () => {
    const [drivers, products] = await Promise.all([
      prisma.user.findMany({
        where: { role: "DRIVER", isActive: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.product.findMany({
        select: { id: true, name: true, basePrice: true },
        orderBy: { name: "asc" },
      }),
    ]);

    const payload: OrdersMetaPayload = { drivers, products };
    metaCache = {
      payload,
      expiresAt: Date.now() + META_CACHE_TTL_MS,
    };
    return payload;
  })();

  try {
    return await metaInFlight;
  } finally {
    metaInFlight = null;
  }
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Нэвтрэх шаардлагатай" }, { status: 401 });
    }

    const { drivers, products } = await loadOrdersMeta();

    return NextResponse.json({ drivers, products });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Алдаа гарлаа" }, { status: 500 });
  }
}
