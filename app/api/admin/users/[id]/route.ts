import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

interface Params {
  id: string;
}

const updateUserSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3)
    .max(40)
    .regex(/^[a-zA-Z0-9._-]+$/, "Нэвтрэх нэрэнд зөвхөн үсэг, тоо, ., _, - зөвшөөрнө"),
  role: z.enum(["ADMIN", "DRIVER", "OPERATOR"]),
});

async function ensureAdmin() {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "Нэвтрэх шаардлагатай" }, { status: 401 }) };
  }

  if (String(session.user.role ?? "").toUpperCase() !== "ADMIN") {
    return { error: NextResponse.json({ error: "Зөвхөн админ хандах эрхтэй" }, { status: 403 }) };
  }

  return { session };
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<Params> }) {
  try {
    const { id } = await params;

    const adminCheck = await ensureAdmin();
    if (adminCheck.error) {
      return adminCheck.error;
    }

    const body = await req.json();
    const parsed = updateUserSchema.safeParse(body);

    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Буруу өгөгдөл";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const target = await prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true },
    });

    if (!target) {
      return NextResponse.json({ error: "Хэрэглэгч олдсонгүй" }, { status: 404 });
    }

    const username = parsed.data.username.trim();
    const role = parsed.data.role;

    const duplicate = await prisma.user.findFirst({
      where: {
        id: { not: id },
        name: username,
      },
      select: { id: true },
    });

    if (duplicate) {
      return NextResponse.json({ error: "Нэвтрэх нэр давхардсан байна" }, { status: 409 });
    }

    if (target.role === "ADMIN" && role !== "ADMIN") {
      const adminCount = await prisma.user.count({ where: { role: "ADMIN", isActive: true } });
      if (adminCount <= 1) {
        return NextResponse.json({ error: "Сүүлийн админы эрхийг өөрчлөх боломжгүй" }, { status: 400 });
      }
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { name: username, role },
      select: {
        id: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ user: updated, message: "Хэрэглэгч шинэчлэгдлээ" });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Алдаа гарлаа" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<Params> }) {
  try {
    const { id } = await params;

    const adminCheck = await ensureAdmin();
    if (adminCheck.error) {
      return adminCheck.error;
    }

    const session = adminCheck.session!;
    if (id === session.user.id) {
      return NextResponse.json({ error: "Өөрийгөө устгах боломжгүй" }, { status: 400 });
    }

    const target = await prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true },
    });

    if (!target) {
      return NextResponse.json({ error: "Хэрэглэгч олдсонгүй" }, { status: 404 });
    }

    if (target.role === "ADMIN") {
      const adminCount = await prisma.user.count({ where: { role: "ADMIN", isActive: true } });
      if (adminCount <= 1) {
        return NextResponse.json({ error: "Сүүлийн админыг устгах боломжгүй" }, { status: 400 });
      }
    }

    await prisma.user.delete({ where: { id } });

    return NextResponse.json({ success: true, message: "Хэрэглэгч устгагдлаа" });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Алдаа гарлаа" }, { status: 500 });
  }
}
