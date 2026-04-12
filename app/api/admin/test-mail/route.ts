import { NextRequest, NextResponse } from "next/server";
import { sendDriverAssignmentEmail } from "@/lib/mailer";

export async function POST(req: NextRequest) {
  const { email } = await req.json();

  if (!email) {
    return NextResponse.json({ error: "email required" }, { status: 400 });
  }

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
  } else {
    return NextResponse.json({ success: false, message: "SMTP not configured or send failed" }, { status: 500 });
  }
}
