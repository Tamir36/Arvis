const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Checking all products for stock history issues...\n');

  // Get all products
  const products = await prisma.product.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, name: true },
    orderBy: { name: 'asc' }
  });

  console.log(`Found ${products.length} active products\n`);

  for (const product of products) {
    // Get all audit logs for this product
    const logs = await prisma.orderAuditLog.findMany({
      where: {
        action: { in: ['DRIVER_STOCK_DEDUCTED', 'DRIVER_STOCK_RESTORED'] },
        newValue: { contains: product.id }
      }
    });

    if (logs.length === 0) continue;

    // Parse and count by reason
    const reasonCounts = {};
    logs.forEach(log => {
      try {
        const parsed = JSON.parse(log.newValue);
        const reason = parsed?.reason || 'no_reason';
        reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
      } catch (e) {
        // ignore parse errors
      }
    });

    // Check for problematic reasons
    const problems = ['released', 'reserved', 'driver_reassigned'];
    const hasProblem = problems.some(p => reasonCounts[p] > 0);

    if (hasProblem) {
      console.log(`⚠️  ${product.name} (${product.id})`);
      console.log(`   Total logs: ${logs.length}`);
      Object.entries(reasonCounts).forEach(([reason, count]) => {
        const marker = problems.includes(reason) ? '❌' : '✓';
        console.log(`   ${marker} ${reason}: ${count}`);
      });
      console.log();
    }
  }

  console.log('Verification complete. The fix in /api/products/[id]/route.ts filters these entries.');
  process.exit(0);
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
