const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function parseArgs() {
  const args = process.argv.slice(2);
  const params = {
    days: 90,
    batchSize: 2000,
    execute: false,
    maxBatches: 0,
  };

  for (const arg of args) {
    if (arg.startsWith("--days=")) params.days = Number(arg.split("=")[1]);
    if (arg.startsWith("--batch=")) params.batchSize = Number(arg.split("=")[1]);
    if (arg === "--execute") params.execute = true;
    if (arg.startsWith("--max-batches=")) params.maxBatches = Number(arg.split("=")[1]);
  }

  return params;
}

async function ensureArchiveTable() {
  await prisma.$executeRawUnsafe(
    "CREATE TABLE IF NOT EXISTS order_audit_logs_archive LIKE order_audit_logs"
  );

  // Optional optimization indexes for archive lookups.
  await prisma.$executeRawUnsafe(
    "CREATE INDEX idx_archive_action_createdAt ON order_audit_logs_archive(action, createdAt)"
  ).catch(() => {});

  await prisma.$executeRawUnsafe(
    "CREATE INDEX idx_archive_orderId_createdAt ON order_audit_logs_archive(orderId, createdAt)"
  ).catch(() => {});
}

async function getCountOlderThan(cutoff) {
  const rows = await prisma.$queryRawUnsafe(
    "SELECT COUNT(*) AS c FROM order_audit_logs WHERE createdAt < ?",
    cutoff
  );
  return Number(rows?.[0]?.c ?? 0);
}

async function getBatchIds(cutoff, batchSize) {
  const rows = await prisma.$queryRawUnsafe(
    "SELECT id FROM order_audit_logs WHERE createdAt < ? ORDER BY createdAt ASC LIMIT ?",
    cutoff,
    batchSize
  );
  return rows.map((r) => r.id);
}

function placeholders(n) {
  return Array.from({ length: n }, () => "?").join(",");
}

async function copyIdsToArchive(ids) {
  if (ids.length === 0) return 0;
  const sql = `
    INSERT IGNORE INTO order_audit_logs_archive
    SELECT *
    FROM order_audit_logs
    WHERE id IN (${placeholders(ids.length)})
  `;
  return prisma.$executeRawUnsafe(sql, ...ids);
}

async function verifyIdsInArchive(ids) {
  if (ids.length === 0) return 0;
  const sql = `
    SELECT COUNT(*) AS c
    FROM order_audit_logs_archive
    WHERE id IN (${placeholders(ids.length)})
  `;
  const rows = await prisma.$queryRawUnsafe(sql, ...ids);
  return Number(rows?.[0]?.c ?? 0);
}

async function deleteIdsFromSource(ids) {
  if (ids.length === 0) return 0;
  const sql = `
    DELETE FROM order_audit_logs
    WHERE id IN (${placeholders(ids.length)})
  `;
  return prisma.$executeRawUnsafe(sql, ...ids);
}

async function getSizesMb() {
  const rows = await prisma.$queryRawUnsafe(`
    SELECT TABLE_NAME, ROUND((DATA_LENGTH + INDEX_LENGTH) / 1024 / 1024, 2) AS size_mb
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME IN ('order_audit_logs', 'order_audit_logs_archive')
    ORDER BY TABLE_NAME ASC
  `);
  return rows;
}

async function main() {
  const { days, batchSize, execute, maxBatches } = parseArgs();

  if (!Number.isFinite(days) || days <= 0) throw new Error("Invalid --days value");
  if (!Number.isFinite(batchSize) || batchSize <= 0) throw new Error("Invalid --batch value");

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  console.log("=== Archive order_audit_logs ===");
  console.log("mode:", execute ? "EXECUTE" : "DRY-RUN");
  console.log("cutoff:", cutoff.toISOString());
  console.log("batchSize:", batchSize);
  console.log("maxBatches:", maxBatches || "unlimited");

  await ensureArchiveTable();

  const totalCandidates = await getCountOlderThan(cutoff);
  console.log("rows older than cutoff:", totalCandidates);

  const sizesBefore = await getSizesMb();
  console.log("sizes before:", sizesBefore);

  if (!execute || totalCandidates === 0) {
    console.log("Dry-run finished. No delete executed.");
    return;
  }

  let moved = 0;
  let deleted = 0;
  let batches = 0;

  while (true) {
    if (maxBatches > 0 && batches >= maxBatches) break;

    const ids = await getBatchIds(cutoff, batchSize);
    if (ids.length === 0) break;

    const inserted = await copyIdsToArchive(ids);
    const archivedCount = await verifyIdsInArchive(ids);

    if (archivedCount !== ids.length) {
      throw new Error(`Archive verification failed: expected ${ids.length}, got ${archivedCount}`);
    }

    const removed = await deleteIdsFromSource(ids);

    moved += Number(inserted);
    deleted += Number(removed);
    batches += 1;

    console.log(
      `batch ${batches}: selected=${ids.length}, inserted=${inserted}, deleted=${removed}, totalDeleted=${deleted}`
    );
  }

  const remaining = await getCountOlderThan(cutoff);
  const sizesAfter = await getSizesMb();

  console.log("=== Done ===");
  console.log("batches:", batches);
  console.log("inserted total:", moved);
  console.log("deleted total:", deleted);
  console.log("remaining older-than-cutoff:", remaining);
  console.log("sizes after:", sizesAfter);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
