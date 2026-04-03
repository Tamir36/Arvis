import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { generateSlug } from "@/lib/utils";

const productCreateSchema = z.object({
  name: z.string().min(1),
  categoryId: z.string().optional(),
  basePrice: z.coerce.number().min(0),
  status: z.enum(["ACTIVE", "DRAFT"]),
  description: z.string().optional(),
  images: z.array(z.string()).optional(),
  quantity: z.coerce.number().default(0),
});

async function generateUniqueProductSlug(name: string): Promise<string> {
  const baseSlug = generateSlug(name) || `product-${Date.now()}`;
  let candidate = baseSlug;
  let suffix = 2;

  while (true) {
    const exists = await prisma.product.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });

    if (!exists) return candidate;

    candidate = `${baseSlug}-${suffix}`;
    suffix++;
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
    const limit = Math.min(100, parseInt(searchParams.get("limit") ?? "10"));
    const search = searchParams.get("search") ?? "";
    const status = searchParams.get("status") ?? "";

    const where: Prisma.ProductWhereInput = {};

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { slug: { contains: search } },
      ];
    }

    if (status) {
      where.status = status as any;
    }

    const [data, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: {
          category: { select: { id: true, name: true } },
          images: { orderBy: { sortOrder: "asc" } },
          inventory: true,
          driverStocks: {
            select: { quantity: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.product.count({ where }),
    ]);

    return NextResponse.json({
      data: data.map((product) => ({
        ...product,
        totalStock:
          (product.inventory?.quantity ?? 0) +
          product.driverStocks.reduce((sum, stock) => sum + stock.quantity, 0),
      })),
      meta: {
        page,
        pageSize: limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Алдаа гарлаа" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN") {
      return NextResponse.json({ error: "Хандах эрх байхгүй" }, { status: 403 });
    }

    const body = await req.json();
    const parsed = productCreateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Баталгаачилалт асуудал" }, { status: 400 });
    }

    const {
      name,
      basePrice,
      status,
      description,
      quantity,
      images,
      categoryId,
    } = parsed.data;

    const slug = await generateUniqueProductSlug(name);

    const createInput: Prisma.ProductCreateInput = {
      name,
      slug,
      basePrice: new Prisma.Decimal(basePrice),
      status,
      ...(description ? { description } : {}),
      ...(categoryId ? { category: { connect: { id: categoryId } } } : {}),
      images: {
        create: (images ?? []).map((url, idx) => ({
          url,
          isPrimary: idx === 0,
          sortOrder: idx,
        })),
      },
      inventory: {
        create: {
          quantity: quantity ?? 0,
        },
      },
      priceHistory: {
        create: {
          price: new Prisma.Decimal(basePrice),
          changedBy: session.user?.id ?? "system",
          reason: "Анхны үнэ",
        },
      },
    };

    const product = await prisma.product.create({
      data: createInput,
      include: { category: true, images: true, inventory: true },
    });

    return NextResponse.json(product, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Алдаа гарлаа" }, { status: 500 });
  }
}
