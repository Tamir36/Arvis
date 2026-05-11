const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const PRODUCT_ID = 'cmnkdrrfs001kx6rred9yjuon';
const from = new Date(Date.UTC(2026, 3, 5, 0, 0, 0) - 8 * 60 * 60 * 1000);
const to = new Date(new Date(Date.UTC(2026, 3, 13, 0, 0, 0) - 8 * 60 * 60 * 1000).getTime() + 24 * 60 * 60 * 1000 - 1);

async function main() {
  const items = await prisma.orderItem.findMany({
    where: {
      productId: PRODUCT_ID,
      order: { status: 'DELIVERED' },
    },
    include: {
      order: {
        select: {
          id: true,
          orderNumber: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });

  const ids = Array.from(new Set(items.map((i) => i.order.id)));

  const logs = await prisma.orderAuditLog.groupBy({
    by: ['orderId'],
    where: {
      action: 'STATUS_CHANGED',
      newValue: 'DELIVERED',
      orderId: { in: ids },
    },
    _max: {
      createdAt: true,
    },
  });

  const deliveredAtByOrderId = new Map(logs.map((l) => [l.orderId, l._max.createdAt]));

  const include = [];
  const exclude = [];

  for (const id of ids) {
    const order = items.find((i) => i.order.id === id).order;
    const deliveredAt = deliveredAtByOrderId.get(id);
    const inByDeliveredLog = Boolean(deliveredAt && deliveredAt >= from && deliveredAt <= to);
    const noExactDeliveredLog = !deliveredAtByOrderId.has(id);
    const inByUpdatedAtFallback = noExactDeliveredLog && order.updatedAt >= from && order.updatedAt <= to;

    if (inByDeliveredLog || inByUpdatedAtFallback) {
      include.push({
        orderNumber: order.orderNumber,
        deliveredAt: deliveredAt ? deliveredAt.toISOString() : '-',
        updatedAt: order.updatedAt.toISOString(),
      });
    } else {
      exclude.push({
        orderNumber: order.orderNumber,
        deliveredAt: deliveredAt ? deliveredAt.toISOString() : '-',
        updatedAt: order.updatedAt.toISOString(),
      });
    }
  }

  include.sort((a, b) => a.orderNumber.localeCompare(b.orderNumber));
  exclude.sort((a, b) => a.orderNumber.localeCompare(b.orderNumber));

  console.log('Included by current API logic:', include.length);
  console.log(include.map((x) => x.orderNumber).join(', '));
  console.log('');
  console.log('Excluded by current API logic:', exclude.length);
  for (const x of exclude) {
    console.log(`${x.orderNumber} | deliveredAt=${x.deliveredAt} | updatedAt=${x.updatedAt}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
