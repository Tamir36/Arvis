import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function ensureUsers() {
  const adminPassword = await bcrypt.hash("admin123", 12);
  const operatorPassword = await bcrypt.hash("operator123", 12);
  const driverPassword = await bcrypt.hash("driver123", 12);

  await prisma.user.upsert({
    where: { email: "admin@arvis.mn" },
    update: {
      isActive: true,
      role: "ADMIN",
      password: adminPassword,
    },
    create: {
      email: "admin@arvis.mn",
      name: "Админ Хэрэглэгч",
      phone: "99001122",
      password: adminPassword,
      role: "ADMIN",
      isActive: true,
    },
  });

  await prisma.user.upsert({
    where: { email: "operator@arvis.mn" },
    update: {
      isActive: true,
      role: "OPERATOR",
      password: operatorPassword,
    },
    create: {
      email: "operator@arvis.mn",
      name: "Оператор Хэрэглэгч",
      phone: "99003344",
      password: operatorPassword,
      role: "OPERATOR",
      isActive: true,
    },
  });

  await prisma.user.upsert({
    where: { email: "driver@arvis.mn" },
    update: {
      isActive: true,
      role: "DRIVER",
      password: driverPassword,
    },
    create: {
      email: "driver@arvis.mn",
      name: "Жолооч 1",
      phone: "99005566",
      password: driverPassword,
      role: "DRIVER",
      isActive: true,
    },
  });

  console.log("Default auth users are ensured.");
}

ensureUsers()
  .catch((error) => {
    console.error("Failed to ensure default auth users:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
