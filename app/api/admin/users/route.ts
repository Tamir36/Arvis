import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { z } from "zod";

const createUserSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3)
    .max(40)
    .regex(/^[\p{L}\p{N}._\- ]+$/u, "Нэвтрэх нэрэнд зөвхөн үсэг, тоо, зай, ., _, - зөвшөөрнө"),
  password: z.string().min(4).max(100),
  role: z.enum(["ADMIN", "DRIVER", "OPERATOR"]),
  email: z.string().trim().optional(),
  isActive: z.boolean().optional(),
  receiveOrderNotifications: z.boolean().optional(),
});

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Нэвтрэх шаардлагатай" }, { status: 401 });
    }

    if (String(session.user.role ?? "").toUpperCase() !== "ADMIN") {
      return NextResponse.json({ error: "Зөвхөн админ хандах эрхтэй" }, { status: 403 });
    }

    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        receiveOrderNotifications: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ users });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Алдаа гарлаа" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Нэвтрэх шаардлагатай" }, { status: 401 });
    }

    if (String(session.user.role ?? "").toUpperCase() !== "ADMIN") {
      return NextResponse.json({ error: "Зөвхөн админ хэрэглэгч үүсгэнэ" }, { status: 403 });
    }

    const body = await req.json();
    const parsed = createUserSchema.safeParse(body);

    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Буруу өгөгдөл";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const username = parsed.data.username.trim();
    const role = parsed.data.role;
    const password = parsed.data.password;
    const isActive = parsed.data.isActive ?? true;
    const inputEmail = String(parsed.data.email ?? "").trim().toLowerCase();
    const receiveOrderNotifications = role === "DRIVER"
      ? (parsed.data.receiveOrderNotifications ?? false)
      : false;
    const generatedEmail = `${username.toLowerCase()}@local.arvis`;
    const emailToSave = role === "DRIVER" ? inputEmail : (inputEmail || generatedEmail);

    if (role === "DRIVER" && !inputEmail) {
      return NextResponse.json({ error: "Жолоочийн имэйл заавал бөглөнө" }, { status: 400 });
    }

    if (inputEmail && !isValidEmail(inputEmail)) {
      return NextResponse.json({ error: "Имэйлийн формат буруу байна" }, { status: 400 });
    }

    const exists = await prisma.user.findFirst({
      where: {
        OR: [
          { name: username },
          { email: emailToSave },
        ],
      },
      select: { id: true },
    });

    if (exists) {
      return NextResponse.json({ error: "Нэвтрэх нэр давхардсан байна" }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        name: username,
        email: emailToSave,
        password: passwordHash,
        role,
        isActive,
        receiveOrderNotifications,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        receiveOrderNotifications: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      user,
      loginName: user.name,
      message: "Хэрэглэгч амжилттай үүслээ",
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Алдаа гарлаа" }, { status: 500 });
  }
}
