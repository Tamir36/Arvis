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

interface MailerDiagnostics {
  configured: boolean;
  missingKeys: string[];
  host: string;
  port: number;
  secure: boolean;
  hasQuotedHost: boolean;
  hasQuotedUser: boolean;
  hasQuotedPass: boolean;
  hasQuotedFrom: boolean;
  userMasked: string;
  fromMasked: string;
  usingHttpApi: boolean;
}

function toBool(value: string | undefined): boolean {
  return String(value ?? "").toLowerCase() === "true";
}

function stripWrappingQuotes(value: string | undefined): string {
  const text = String(value ?? "").trim();
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1).trim();
  }
  return text;
}

function hasWrappingQuotes(value: string | undefined): boolean {
  const text = String(value ?? "").trim();
  return (text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"));
}

function maskEmail(value: string): string {
  const text = value.trim();
  const at = text.indexOf("@");
  if (at <= 1) return text ? "***" : "";
  return `${text.slice(0, 2)}***${text.slice(at)}`;
}

export function getMailerDiagnostics(): MailerDiagnostics {
  const rawHost = process.env.SMTP_HOST;
  const rawUser = process.env.SMTP_USER;
  const rawPass = process.env.SMTP_PASS;
  const rawFrom = process.env.MAIL_FROM ?? process.env.SMTP_USER;
  const host = stripWrappingQuotes(rawHost);
  const user = stripWrappingQuotes(rawUser);
  const pass = stripWrappingQuotes(rawPass);
  const from = stripWrappingQuotes(rawFrom);
  const port = Number(stripWrappingQuotes(process.env.SMTP_PORT ?? "587"));
  const secure = toBool(stripWrappingQuotes(process.env.SMTP_SECURE));
  const brevoApiKey = stripWrappingQuotes(process.env.BREVO_API_KEY);

  const usingHttpApi = Boolean(brevoApiKey);

  const missingKeys: string[] = [];
  if (!usingHttpApi) {
    if (!host) missingKeys.push("SMTP_HOST");
    if (!user) missingKeys.push("SMTP_USER");
    if (!pass) missingKeys.push("SMTP_PASS");
    if (!Number.isFinite(port)) missingKeys.push("SMTP_PORT");
  }
  if (!from) missingKeys.push("MAIL_FROM");

  return {
    configured: missingKeys.length === 0,
    missingKeys,
    host,
    port,
    secure,
    hasQuotedHost: hasWrappingQuotes(rawHost),
    hasQuotedUser: hasWrappingQuotes(rawUser),
    hasQuotedPass: hasWrappingQuotes(rawPass),
    hasQuotedFrom: hasWrappingQuotes(rawFrom),
    userMasked: maskEmail(user),
    fromMasked: maskEmail(from),
    usingHttpApi,
  };
}

function getTransporter(): nodemailer.Transporter | null {
  if (transporterInitialized) return transporterCache;

  transporterInitialized = true;

  const diagnostics = getMailerDiagnostics();
  if (!diagnostics.configured || diagnostics.usingHttpApi) {
    transporterCache = null;
    return null;
  }

  transporterCache = nodemailer.createTransport({
    host: diagnostics.host,
    port: diagnostics.port,
    secure: diagnostics.secure,
    auth: {
      user: stripWrappingQuotes(process.env.SMTP_USER),
      pass: stripWrappingQuotes(process.env.SMTP_PASS),
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });

  return transporterCache;
}

async function sendViaBrevoApi(input: {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<void> {
  const apiKey = stripWrappingQuotes(process.env.BREVO_API_KEY);
  if (!apiKey) throw new Error("BREVO_API_KEY not set");

  const fromName = "Arvis";
  const fromEmail = input.from;

  const body = {
    sender: { name: fromName, email: fromEmail },
    to: [{ email: input.to }],
    subject: input.subject,
    textContent: input.text,
    htmlContent: input.html,
  };

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "accept": "application/json",
      "api-key": apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`Brevo API error ${res.status}: ${errorBody}`);
  }
}

export async function sendDriverAssignmentEmail(input: DriverAssignmentEmailInput): Promise<boolean> {
  const diagnostics = getMailerDiagnostics();
  const from = stripWrappingQuotes(process.env.MAIL_FROM ?? process.env.SMTP_USER);

  if (!from || !diagnostics.configured) {
    console.warn("Driver assignment email skipped: not configured.", {
      missingKeys: diagnostics.missingKeys,
      usingHttpApi: diagnostics.usingHttpApi,
    });
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

  try {
    if (diagnostics.usingHttpApi) {
      await sendViaBrevoApi({ from, to: input.driverEmail, subject, text, html });
    } else {
      const transporter = getTransporter();
      if (!transporter) return false;
      await transporter.sendMail({ from, to: input.driverEmail, subject, text, html });
    }
  } catch (error) {
    const err = error as { code?: string; response?: string; message?: string };
    console.error("Driver assignment email send failed", {
      code: err?.code,
      response: err?.response,
      message: err?.message,
      usingHttpApi: diagnostics.usingHttpApi,
      host: diagnostics.host,
      port: diagnostics.port,
    });
    throw error;
  }

  return true;
}

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

interface MailerDiagnostics {
  configured: boolean;
  missingKeys: string[];
  host: string;
  port: number;
  secure: boolean;
  hasQuotedHost: boolean;
  hasQuotedUser: boolean;
  hasQuotedPass: boolean;
  hasQuotedFrom: boolean;
  userMasked: string;
  fromMasked: string;
}

function toBool(value: string | undefined): boolean {
  return String(value ?? "").toLowerCase() === "true";
}

function stripWrappingQuotes(value: string | undefined): string {
  const text = String(value ?? "").trim();
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1).trim();
  }
  return text;
}

function hasWrappingQuotes(value: string | undefined): boolean {
  const text = String(value ?? "").trim();
  return (text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"));
}

function maskEmail(value: string): string {
  const text = value.trim();
  const at = text.indexOf("@");
  if (at <= 1) return text ? "***" : "";
  return `${text.slice(0, 2)}***${text.slice(at)}`;
}

export function getMailerDiagnostics(): MailerDiagnostics {
  const rawHost = process.env.SMTP_HOST;
  const rawUser = process.env.SMTP_USER;
  const rawPass = process.env.SMTP_PASS;
  const rawFrom = process.env.MAIL_FROM ?? process.env.SMTP_USER;
  const host = stripWrappingQuotes(rawHost);
  const user = stripWrappingQuotes(rawUser);
  const pass = stripWrappingQuotes(rawPass);
  const from = stripWrappingQuotes(rawFrom);
  const port = Number(stripWrappingQuotes(process.env.SMTP_PORT ?? "587"));
  const secure = toBool(stripWrappingQuotes(process.env.SMTP_SECURE));

  const missingKeys: string[] = [];
  if (!host) missingKeys.push("SMTP_HOST");
  if (!user) missingKeys.push("SMTP_USER");
  if (!pass) missingKeys.push("SMTP_PASS");
  if (!Number.isFinite(port)) missingKeys.push("SMTP_PORT");
  if (!from) missingKeys.push("MAIL_FROM");

  return {
    configured: missingKeys.length === 0,
    missingKeys,
    host,
    port,
    secure,
    hasQuotedHost: hasWrappingQuotes(rawHost),
    hasQuotedUser: hasWrappingQuotes(rawUser),
    hasQuotedPass: hasWrappingQuotes(rawPass),
    hasQuotedFrom: hasWrappingQuotes(rawFrom),
    userMasked: maskEmail(user),
    fromMasked: maskEmail(from),
  };
}

function getTransporter(): nodemailer.Transporter | null {
  if (transporterInitialized) return transporterCache;

  transporterInitialized = true;

  const diagnostics = getMailerDiagnostics();
  if (!diagnostics.configured) {
    transporterCache = null;
    return null;
  }

  transporterCache = nodemailer.createTransport({
    host: diagnostics.host,
    port: diagnostics.port,
    secure: diagnostics.secure,
    auth: {
      user: stripWrappingQuotes(process.env.SMTP_USER),
      pass: stripWrappingQuotes(process.env.SMTP_PASS),
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });

  return transporterCache;
}

export async function sendDriverAssignmentEmail(input: DriverAssignmentEmailInput): Promise<boolean> {
  const transporter = getTransporter();
  const diagnostics = getMailerDiagnostics();
  const from = stripWrappingQuotes(process.env.MAIL_FROM ?? process.env.SMTP_USER);

  if (!transporter || !from || !diagnostics.configured) {
    console.warn("Driver assignment email skipped: SMTP is not configured.", {
      missingKeys: diagnostics.missingKeys,
      hasQuotedHost: diagnostics.hasQuotedHost,
      hasQuotedUser: diagnostics.hasQuotedUser,
      hasQuotedPass: diagnostics.hasQuotedPass,
      hasQuotedFrom: diagnostics.hasQuotedFrom,
    });
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

  try {
    await transporter.sendMail({
      from,
      to: input.driverEmail,
      subject,
      text,
      html,
    });
  } catch (error) {
    const err = error as { code?: string; response?: string; message?: string };
    console.error("Driver assignment email send failed", {
      code: err?.code,
      response: err?.response,
      message: err?.message,
      host: diagnostics.host,
      port: diagnostics.port,
      secure: diagnostics.secure,
      userMasked: diagnostics.userMasked,
      fromMasked: diagnostics.fromMasked,
    });
    throw error;
  }

  return true;
}
