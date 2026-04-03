import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

type MovementDirection = "IN" | "OUT";

interface MovementItem {
  productId: string;
  name: string;
  qty: number;
}

interface DriverMovement {
  id: string;
  createdAt: Date;
  direction: MovementDirection;
  reason: string;
  reference: string;
  orderPhone?: string | null;
  source: "ORDER" | "TRANSFER";
  items: MovementItem[];
}

function parseAuditPayload(raw: string | null): {
  driverId: string | null;
  driverName: string | null;
  reason: string | null;
  items: MovementItem[];
} {
  if (!raw) {
    return {
      driverId: null,
      driverName: null,
      reason: null,
      items: [],
    };
  }

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return {
        driverId: null,
        driverName: null,
        reason: null,
        items: parsed
          .map((item: any) => ({
            productId: String(item?.productId ?? ""),
            name: String(item?.name ?? "Бараа"),
            qty: Number(item?.qty ?? 0),
          }))
          .filter((item: MovementItem) => item.qty > 0),
      };
    }

    if (!parsed || typeof parsed !== "object") {
      return {
        driverId: null,
        driverName: null,
        reason: null,
        items: [],
      };
    }

    const items = Array.isArray((parsed as { items?: unknown[] }).items)
      ? (parsed as { items: unknown[] }).items
          .map((item: any) => ({
            productId: String(item?.productId ?? ""),
            name: String(item?.name ?? "Бараа"),
            qty: Number(item?.qty ?? 0),
          }))
          .filter((item: MovementItem) => item.qty > 0)
      : [];

    return {
      driverId: typeof (parsed as { driverId?: unknown }).driverId === "string"
        ? (parsed as { driverId: string }).driverId
        : null,
      driverName: typeof (parsed as { driverName?: unknown }).driverName === "string"
        ? (parsed as { driverName: string }).driverName
        : null,
      reason: typeof (parsed as { reason?: unknown }).reason === "string"
        ? (parsed as { reason: string }).reason
        : null,
      items,
    };
  } catch {
    return {
      driverId: null,
      driverName: null,
      reason: null,
      items: [],
    };
  }
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Нэвтрэх шаардлагатай" }, { status: 401 });
    }

    const role = String(session.user.role ?? "").toUpperCase();
    if (role !== "DRIVER") {
      return NextResponse.json({ error: "Зөвхөн жолооч хандах боломжтой" }, { status: 403 });
    }

    const [stocks, stockHistory, transferItems] = await Promise.all([
      prisma.driverStock.findMany({
        where: { driverId: session.user.id },
        include: {
          product: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: {
          product: {
            name: "asc",
          },
        },
      }),
      prisma.orderAuditLog.findMany({
        where: {
          action: { in: ["DRIVER_STOCK_DEDUCTED", "DRIVER_STOCK_RESTORED"] },
          OR: [
            {
              newValue: {
                contains: `"driverId":"${session.user.id}"`,
              },
            },
            {
              AND: [
                {
                  newValue: {
                    not: {
                      contains: '"driverId":',
                    },
                  },
                },
                {
                  order: {
                    assignedToId: session.user.id,
                  },
                },
              ],
            },
          ],
        },
        include: {
          order: {
            select: {
              id: true,
              orderNumber: true,
              status: true,
              customer: {
                select: {
                  name: true,
                  phone: true,
                },
              },
              items: {
                select: {
                  name: true,
                  qty: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 300,
      }),
      prisma.inventoryTransferItem.findMany({
        where: {
          OR: [
            {
              transfer: {
                toType: "DRIVER",
                toDriverId: session.user.id,
              },
            },
            {
              transfer: {
                fromType: "DRIVER",
                fromDriverId: session.user.id,
              },
            },
          ],
        },
        include: {
          product: {
            select: {
              id: true,
              name: true,
            },
          },
          transfer: {
            select: {
              id: true,
              referenceCode: true,
              createdAt: true,
              fromType: true,
              fromDriverId: true,
              toType: true,
              toDriverId: true,
            },
          },
        },
        orderBy: {
          transfer: {
            createdAt: "desc",
          },
        },
        take: 500,
      }),
    ]);

    const orderMovements = stockHistory
      .map<DriverMovement | null>((log) => {
        const payload = parseAuditPayload(log.newValue);
        const items = payload.items;

        if (items.length === 0) {
          return null;
        }

        return {
          id: `order-${log.id}`,
          createdAt: log.createdAt,
          direction: log.action === "DRIVER_STOCK_DEDUCTED" ? "OUT" : "IN",
          reason:
            log.action === "DRIVER_STOCK_DEDUCTED"
              ? "Борлуулсан"
              : payload.reason === "cancelled" || log.order.status === "CANCELLED"
                ? "Цуцалсан тул буцаан нэмсэн"
                : payload.reason === "driver_reassigned"
                  ? "Жолооч солигдсон тул буцаан нэмсэн"
                  : "Буцаан нэмсэн",
          reference: log.order.orderNumber,
          orderPhone: log.order.customer?.phone ?? null,
          source: "ORDER" as const,
          items,
        };
      })
      .filter((movement): movement is DriverMovement => Boolean(movement));

    const transferMovements: DriverMovement[] = transferItems.map((row) => {
      const isToDriver = row.transfer.toType === "DRIVER" && row.transfer.toDriverId === session.user.id;
      const isFromDriver = row.transfer.fromType === "DRIVER" && row.transfer.fromDriverId === session.user.id;

      let direction: MovementDirection = "IN";
      let reason = "Шилжүүлж авсан";

      if (isFromDriver) {
        direction = "OUT";
        reason = row.transfer.toType === "WAREHOUSE" ? "Агуулахад өгсөн" : "Шилжүүлж өгсөн";
      } else if (isToDriver) {
        direction = "IN";
        reason = row.transfer.fromType === "WAREHOUSE" ? "Агуулахаас авсан" : "Шилжүүлж авсан";
      }

      return {
        id: `transfer-${row.id}`,
        createdAt: row.transfer.createdAt,
        direction,
        reason,
        reference: row.transfer.referenceCode,
        orderPhone: null,
        source: "TRANSFER",
        items: [
          {
            productId: row.product.id,
            name: row.product.name,
            qty: row.quantity,
          },
        ],
      };
    });

    const movementMap = new Map<string, DriverMovement>();
    for (const movement of [...orderMovements, ...transferMovements]) {
      const key = `${movement.source}:${movement.reference}:${movement.direction}:${movement.createdAt.toISOString()}:${movement.reason}:${movement.orderPhone ?? ""}`;
      const existing = movementMap.get(key);
      if (!existing) {
        movementMap.set(key, movement);
        continue;
      }

      existing.items.push(...movement.items);
    }

    const movements = Array.from(movementMap.values())
      .map((movement) => ({
        ...movement,
        items: movement.items.filter((item) => item.qty > 0),
      }))
      .filter((movement) => movement.items.length > 0)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return NextResponse.json({ stocks, stockHistory, movements });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Алдаа гарлаа" }, { status: 500 });
  }
}
