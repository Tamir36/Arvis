import nodemailer from "nodemailer";

interface DriverAssignmentEmailInput {
  driverEmail: string;
  driverName: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  shippingAddress?: string | null;
  status: string;
  assignedBy: string;
  items?: Array<{ name: string; qty: number }>;
  totalAmount?: number;
}

let transporterCache: nodemailer.Transporter | null = null;
let transporterInitialized = false;

function toBool(value: string | undefined): boolean {
  return String(value ?? "").toLowerCase() === "true";
}

function getTransporter(): nodemailer.Transporter | null {
  if (transporterInitialized) return transporterCache;

  transporterInitialized = true;

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass || !Number.isFinite(port)) {
    transporterCache = null;
    return null;
  }

  transporterCache = nodemailer.createTransport({
    host,
    port,
    secure: toBool(process.env.SMTP_SECURE),
    auth: {
      user,
      pass,
    },
  });

  return transporterCache;
}

export async function sendDriverAssignmentEmail(input: DriverAssignmentEmailInput): Promise<boolean> {
  const transporter = getTransporter();
  const from = process.env.MAIL_FROM ?? process.env.SMTP_USER;

  if (!transporter || !from) {
    console.warn("Driver assignment email skipped: SMTP is not configured.");
    return false;
  }

  const subject = "Шинэ захиалга бүртгэгдлээ";
  const addressLine = input.shippingAddress?.trim() || "N/A";
  const itemsLine = (input.items ?? [])
    .map((item) => `${item.name} - ${item.qty}`)
    .join(", ") || input.orderNumber;
  const totalLine = Number.isFinite(input.totalAmount)
    ? `${new Intl.NumberFormat("en-US").format(Number(input.totalAmount))}₮`
    : null;
  const text = [
    `Утас: ${input.customerPhone}`,
    `Хаяг: ${addressLine}`,
    `Бараа: ${itemsLine}`,
    ...(totalLine ? [`Тооцоо: ${totalLine}`] : []),
  ].join("\n");

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#111;">
      <h2 style="margin:0 0 12px;">Шинэ захиалга бүртгэгдлээ</h2>
      <table style="border-collapse:collapse;">
        <tr><td style="padding:4px 10px 4px 0;"><strong>Утас</strong></td><td style="padding:4px 0;">${input.customerPhone}</td></tr>
        <tr><td style="padding:4px 10px 4px 0;"><strong>Хаяг</strong></td><td style="padding:4px 0;">${addressLine}</td></tr>
        <tr><td style="padding:4px 10px 4px 0;"><strong>Бараа</strong></td><td style="padding:4px 0;">${itemsLine}</td></tr>
        ${totalLine ? `<tr><td style="padding:4px 10px 4px 0;"><strong>Тооцоо</strong></td><td style="padding:4px 0;">${totalLine}</td></tr>` : ""}
      </table>
    </div>
  `;

  await transporter.sendMail({
    from,
    to: input.driverEmail,
    subject,
    text,
    html,
  });

  return true;
}
