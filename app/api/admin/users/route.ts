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
    .regex(/^[a-zA-Z0-9._-]+$/, "Нэвтрэх нэрэнд зөвхөн үсэг, тоо, ., _, - зөвшөөрнө"),
  password: z.string().min(4).max(100),
  role: z.enum(["ADMIN", "DRIVER", "OPERATOR"]),
});

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
        role: true,
        isActive: true,
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
    const generatedEmail = `${username.toLowerCase()}@local.arvis`;

    const exists = await prisma.user.findFirst({
      where: {
        OR: [
          { name: username },
          { email: generatedEmail },
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
        email: generatedEmail,
        password: passwordHash,
        role,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
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
