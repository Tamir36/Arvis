import { NextRequest, NextResponse } from "next/server";
import { getMailerDiagnostics, sendDriverAssignmentEmail } from "@/lib/mailer";

export async function GET() {
  return NextResponse.json({
    ok: true,
    diagnostics: getMailerDiagnostics(),
  });
}

export async function POST(req: NextRequest) {
  const { email } = await req.json();

  if (!email) {
    return NextResponse.json({ error: "email required" }, { status: 400 });
  }

  try {
    const ok = await sendDriverAssignmentEmail({
      driverEmail: email,
      driverName: "Test Driver",
      orderNumber: "TEST-001",
      customerName: "Test Customer",
      customerPhone: "99001122",
      shippingAddress: "Улаанбаатар, Сүхбаатар дүүрэг",
      status: "PENDING",
      assignedBy: "Admin",
    });

    if (ok) {
      return NextResponse.json({ success: true, message: `Mail sent to ${email}` });
    }

    return NextResponse.json({
      success: false,
      message: "SMTP not configured",
      diagnostics: getMailerDiagnostics(),
    }, { status: 500 });
  } catch (error) {
    const err = error as { code?: string; response?: string; message?: string };
    return NextResponse.json({
      success: false,
      message: "SMTP send failed",
      error: {
        code: err?.code ?? null,
        response: err?.response ?? null,
        message: err?.message ?? String(error),
      },
      diagnostics: getMailerDiagnostics(),
    }, { status: 500 });
  }
}
