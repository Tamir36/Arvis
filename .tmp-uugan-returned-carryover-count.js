const fs = require("fs");
if (fs.existsSync(".env.local")) {
  for (const raw of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i === -1) continue;
    const key = line.slice(0, i).trim();
    let value = line.slice(i + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const BUSINESS_TIME_ZONE = "Asia/Ulaanbaatar";
const BUSINESS_UTC_OFFSET_MINUTES = 8 * 60;

function startOfDay(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = Number(parts.find((part) => part.type === "year")?.value ?? "0");
  const month = Number(parts.find((part) => part.type === "month")?.value ?? "1");
  const day = Number(parts.find((part) => part.type === "day")?.value ?? "1");

  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0) - BUSINESS_UTC_OFFSET_MINUTES * 60 * 1000);
}

(async () => {
  const todayStart = startOfDay(new Date());

  const uugan = await prisma.user.findFirst({
    where: { name: { contains: "Uuganbayar" } },
    select: { id: true, name: true },
  });

  if (!uugan) {
    console.log(JSON.stringify({ userFound: false, count: 0 }, null, 2));
    return;
  }

  const where = {
    assignedToId: uugan.id,
    status: "RETURNED",
    createdAt: { lt: todayStart },
    OR: [
      { delivery: { is: null } },
      { delivery: { is: { timeSlotId: null } } },
      { delivery: { is: { timeSlot: { is: { date: { lt: todayStart } } } } } },
    ],
  };

  const count = await prisma.order.count({ where });

  console.log(JSON.stringify({
    userFound: true,
    userId: uugan.id,
    userName: uugan.name,
    todayStartUBBoundaryUTC: todayStart.toISOString(),
    count,
  }, null, 2));
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
