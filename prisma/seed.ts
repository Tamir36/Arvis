import { PrismaClient, UserRole, ProductStatus, OrderStatus, PaymentStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // Hash passwords
  const adminPassword = await bcrypt.hash("admin123", 12);
  const operatorPassword = await bcrypt.hash("operator123", 12);
  const driverPassword = await bcrypt.hash("driver123", 12);

  // Create users
  const admin = await prisma.user.upsert({
    where: { email: "admin@arvis.mn" },
    update: {},
    create: {
      email: "admin@arvis.mn",
      name: "Админ Хэрэглэгч",
      phone: "99001122",
      password: adminPassword,
      role: UserRole.ADMIN,
    },
  });

  const operator = await prisma.user.upsert({
    where: { email: "operator@arvis.mn" },
    update: {},
    create: {
      email: "operator@arvis.mn",
      name: "Оператор Хэрэглэгч",
      phone: "99003344",
      password: operatorPassword,
      role: UserRole.OPERATOR,
    },
  });

  const driver = await prisma.user.upsert({
    where: { email: "driver@arvis.mn" },
    update: { name: "Жолооч 1" },
    create: {
      email: "driver@arvis.mn",
      name: "Жолооч 1",
      phone: "99005566",
      password: driverPassword,
      role: UserRole.DRIVER,
    },
  });

  // Create delivery agent for driver
  await prisma.deliveryAgent.upsert({
    where: { userId: driver.id },
    update: {},
    create: {
      userId: driver.id,
      vehicleType: "Мотоцикл",
      vehiclePlate: "УНА-1234",
      maxWeight: 20,
      maxVolume: 50,
    },
  });

  const driver2 = await prisma.user.upsert({
    where: { email: "driver2@arvis.mn" },
    update: { name: "Жолооч 2" },
    create: {
      email: "driver2@arvis.mn",
      name: "Жолооч 2",
      phone: "99007788",
      password: driverPassword,
      role: UserRole.DRIVER,
    },
  });

  await prisma.deliveryAgent.upsert({
    where: { userId: driver2.id },
    update: {},
    create: {
      userId: driver2.id,
      vehicleType: "Машин",
      vehiclePlate: "УНА-5678",
      maxWeight: 100,
      maxVolume: 200,
    },
  });

  const driver3 = await prisma.user.upsert({
    where: { email: "driver3@arvis.mn" },
    update: { name: "Жолооч 3" },
    create: {
      email: "driver3@arvis.mn",
      name: "Жолооч 3",
      phone: "99009900",
      password: driverPassword,
      role: UserRole.DRIVER,
    },
  });

  await prisma.deliveryAgent.upsert({
    where: { userId: driver3.id },
    update: {},
    create: {
      userId: driver3.id,
      vehicleType: "Мотоцикл",
      vehiclePlate: "УНА-9012",
      maxWeight: 20,
      maxVolume: 50,
    },
  });

  // Create categories
  const health = await prisma.category.upsert({
    where: { slug: "health" },
    update: { name: "Эрүүл мэнд", description: "Эрүүл мэндийн бараа" },
    create: {
      name: "Эрүүл мэнд",
      slug: "health",
      description: "Эрүүл мэндийн бараа",
    },
  });

  const toys = await prisma.category.upsert({
    where: { slug: "toys" },
    update: { name: "Тоглоом", description: "Хүүхдийн тоглоом" },
    create: {
      name: "Тоглоом",
      slug: "toys",
      description: "Хүүхдийн тоглоом",
    },
  });

  const tools = await prisma.category.upsert({
    where: { slug: "tools" },
    update: { name: "Багаж, хэрэгсэл", description: "Засвар, угсралтын хэрэгсэл" },
    create: {
      name: "Багаж, хэрэгсэл",
      slug: "tools",
      description: "Засвар, угсралтын хэрэгсэл",
    },
  });

  const automotive = await prisma.category.upsert({
    where: { slug: "automotive" },
    update: { name: "Машин", description: "Автомашины бараа" },
    create: {
      name: "Машин",
      slug: "automotive",
      description: "Автомашины бараа",
    },
  });

  const furniture = await prisma.category.upsert({
    where: { slug: "furniture" },
    update: { name: "Тавилга", description: "Гэр, оффисын тавилга" },
    create: {
      name: "Тавилга",
      slug: "furniture",
      description: "Гэр, оффисын тавилга",
    },
  });

  const home = await prisma.category.upsert({
    where: { slug: "home" },
    update: { name: "Гэр ахуй", description: "Гэр ахуйн хэрэглэл" },
    create: {
      name: "Гэр ахуй",
      slug: "home",
      description: "Гэр ахуйн хэрэглэл",
    },
  });

  const clothing = await prisma.category.upsert({
    where: { slug: "clothing" },
    update: { name: "Хувцас", description: "Хувцас, гутал, аксессуар" },
    create: {
      name: "Хувцас",
      slug: "clothing",
      description: "Хувцас, гутал, аксессуар",
    },
  });

  const beauty = await prisma.category.upsert({
    where: { slug: "beauty" },
    update: { name: "Гоо сайхан", description: "Арьс арчилгаа, гоо сайхны бараа" },
    create: {
      name: "Гоо сайхан",
      slug: "beauty",
      description: "Арьс арчилгаа, гоо сайхны бараа",
    },
  });

  // Create products
  const product1 = await prisma.product.upsert({
    where: { slug: "samsung-galaxy-a54" },
    update: {},
    create: {
      name: "Samsung Galaxy A54",
      slug: "samsung-galaxy-a54",
      description: "<p>Samsung Galaxy A54 утас. 6.4 инч дэлгэц, 128GB санах ой.</p>",
      categoryId: tools.id,
      basePrice: 1299000,
      status: ProductStatus.ACTIVE,
      sku: "SAM-A54-001",
      weight: 0.2,
      tags: "samsung,утас,android",
    },
  });

  await prisma.inventory.upsert({
    where: { productId: product1.id },
    update: {},
    create: {
      productId: product1.id,
      quantity: 25,
      reserved: 3,
      minStock: 5,
      location: "A-01",
    },
  });

  await prisma.priceHistory.create({
    data: {
      productId: product1.id,
      price: 1299000,
      changedBy: admin.id,
      reason: "Анхны үнэ",
    },
  });

  const product2 = await prisma.product.upsert({
    where: { slug: "polo-shirt-men" },
    update: {},
    create: {
      name: "Polo цамц (Эрэгтэй)",
      slug: "polo-shirt-men",
      description: "<p>100% хөвөн материалтай polo цамц.</p>",
      categoryId: clothing.id,
      basePrice: 45000,
      status: ProductStatus.ACTIVE,
      sku: "POLO-M-001",
      weight: 0.3,
      tags: "цамц,хувцас,polo",
    },
  });

  // Variants for shirt
  await prisma.productVariant.createMany({
    data: [
      { productId: product2.id, name: "S - Улаан", size: "S", color: "Улаан", stock: 10 },
      { productId: product2.id, name: "M - Улаан", size: "M", color: "Улаан", stock: 15 },
      { productId: product2.id, name: "L - Цэнхэр", size: "L", color: "Цэнхэр", stock: 8 },
      { productId: product2.id, name: "XL - Цэнхэр", size: "XL", color: "Цэнхэр", stock: 5 },
    ],
    skipDuplicates: true,
  });

  await prisma.inventory.upsert({
    where: { productId: product2.id },
    update: {},
    create: {
      productId: product2.id,
      quantity: 38,
      reserved: 0,
      minStock: 10,
      location: "B-12",
    },
  });

  // Seed sample driver stock distributions
  await prisma.driverStock.createMany({
    data: [
      { driverId: driver.id,  productId: product1.id, quantity: 5 },
      { driverId: driver2.id, productId: product1.id, quantity: 3 },
      { driverId: driver3.id, productId: product1.id, quantity: 2 },
      { driverId: driver.id,  productId: product2.id, quantity: 8 },
      { driverId: driver2.id, productId: product2.id, quantity: 5 },
      { driverId: driver3.id, productId: product2.id, quantity: 4 },
    ],
    skipDuplicates: true,
  });

  // Create delivery zones
  await prisma.deliveryZone.createMany({
    data: [
      { name: "Хан-Уул дүүрэг", description: "Хан-Уул дүүргийн бүх хороо", fee: 5000 },
      { name: "Сүхбаатар дүүрэг", description: "Сүхбаатар дүүргийн бүх хороо", fee: 5000 },
      { name: "Баянзүрх дүүрэг", description: "Баянзүрх дүүрэг", fee: 6000 },
      { name: "Чингэлтэй дүүрэг", description: "Чингэлтэй дүүрэг", fee: 5000 },
      { name: "Багануур дүүрэг", description: "Багануур дүүрэг", fee: 10000 },
    ],
    skipDuplicates: true,
  });

  // Create customers
  const customer1 = await prisma.customer.create({
    data: {
      name: "Болд Баатар",
      email: "bold@example.mn",
      phone: "88001122",
      address: "Хан-Уул, 11-р хороо, 45 тоот",
      district: "Хан-Уул",
      city: "Улаанбаатар",
    },
  });

  const customer2 = await prisma.customer.create({
    data: {
      name: "Сарнай Дорж",
      email: "sarnai@example.mn",
      phone: "88003344",
      address: "Сүхбаатар, 3-р хороо, 12 байр",
      district: "Сүхбаатар",
      city: "Улаанбаатар",
    },
  });

  // Create sample order
  await prisma.order.upsert({
    where: { orderNumber: "ORD-2024-0001" },
    update: {},
    create: {
      orderNumber: "ORD-2024-0001",
      customerId: customer1.id,
      status: OrderStatus.CONFIRMED,
      paymentStatus: PaymentStatus.PAID,
      subtotal: 1299000,
      discount: 0,
      deliveryFee: 5000,
      tax: 0,
      total: 1304000,
      shippingAddress: "Хан-Уул, 11-р хороо, 45 тоот",
      items: {
        create: [
          {
            productId: product1.id,
            name: "Samsung Galaxy A54",
            qty: 1,
            unitPrice: 1299000,
            discount: 0,
            tax: 0,
            total: 1299000,
          },
        ],
      },
      auditLogs: {
        create: [
          {
            userId: admin.id,
            action: "CREATED",
            newValue: JSON.stringify({ status: "PENDING" }),
          },
          {
            userId: operator.id,
            action: "STATUS_CHANGED",
            oldValue: JSON.stringify({ status: "PENDING" }),
            newValue: JSON.stringify({ status: "CONFIRMED" }),
          },
        ],
      },
    },
  });

  // Create coupon
  await prisma.coupon.upsert({
    where: { code: "ARVIS10" },
    update: {},
    create: {
      code: "ARVIS10",
      type: "PERCENTAGE",
      value: 10,
      minOrder: 50000,
      maxUses: 100,
      isActive: true,
    },
  });

  console.log("✅ Seed completed!");
  console.log("─────────────────────────────────────");
  console.log("Admin:    admin@arvis.mn    / admin123");
  console.log("Operator: operator@arvis.mn / operator123");
  console.log("Driver:   driver@arvis.mn   / driver123");
  console.log("─────────────────────────────────────");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
