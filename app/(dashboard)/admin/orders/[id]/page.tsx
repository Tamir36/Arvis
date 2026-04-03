import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import Header from "@/components/layout/Header";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import Badge, { orderStatusBadge, paymentStatusBadge } from "@/components/ui/Badge";
import { mn } from "@/locales/mn";
import { formatPrice, formatDateTime, formatDate } from "@/lib/utils";
import Link from "next/link";
import OrderActions from "./_components/OrderActions";
import PaymentReceivedToggle from "./_components/PaymentReceivedToggle";
import { ArrowLeft, User, MapPin, Package, CreditCard, Clock } from "lucide-react";

interface OrderDetailPageProps {
  params: Promise<{ id: string }>;
}

async function getOrder(id: string) {
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      customer: true,
      coupon: true,
      items: {
        include: {
          product: { select: { id: true, name: true, images: { where: { isPrimary: true }, take: 1 } } },
          variant: true,
        },
      },
      auditLogs: {
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "desc" },
      },
      delivery: {
        include: {
          agent: { include: { user: { select: { name: true, phone: true } } } },
          zone: true,
          timeSlot: true,
        },
      },
    },
  });
  return order;
}

export default async function OrderDetailPage({ params }: OrderDetailPageProps) {
  const { id } = await params;
  const order = await getOrder(id);
  if (!order) notFound();

  return (
    <div>
      <Header
        title={`Захиалга: ${order.orderNumber}`}
        subtitle={`Үүсгэсэн: ${formatDateTime(order.createdAt)}`}
      />

      <div className="p-5 space-y-5 max-w-5xl">
        {/* Back + Status */}
        <div className="flex items-center gap-3 flex-wrap">
          <Link href="/admin/orders" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
            <ArrowLeft className="w-4 h-4" /> Буцах
          </Link>
          <div className="flex items-center gap-2 ml-auto">
            <Badge variant={orderStatusBadge(order.status)} dot>
              {mn.status[order.status as keyof typeof mn.status]}
            </Badge>
            <Badge variant={paymentStatusBadge(order.paymentStatus)}>
              {mn.status[order.paymentStatus as keyof typeof mn.status]}
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Left: Order + Items */}
          <div className="lg:col-span-2 space-y-5">
            {/* Items */}
            <Card>
              <CardHeader>
                <CardTitle>
                  <Package className="w-4 h-4 inline mr-2 text-blue-500" />
                  Захиалгын бараа ({order.items.length})
                </CardTitle>
              </CardHeader>
              <div className="space-y-3">
                {order.items.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                    <div className="w-12 h-12 bg-slate-200 rounded-xl overflow-hidden shrink-0">
                      {item.product.images[0] ? (
                        <img src={item.product.images[0].url} alt={item.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-400">📦</div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-800 truncate">{item.name}</p>
                      {item.variant && (
                        <p className="text-xs text-slate-400">{item.variant.name}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-semibold text-slate-800">{formatPrice(Number(item.total))}</p>
                      <p className="text-xs text-slate-400">{item.qty} × {formatPrice(Number(item.unitPrice))}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Payment summary */}
            <Card>
              <CardHeader>
                <CardTitle>
                  <CreditCard className="w-4 h-4 inline mr-2 text-green-500" />
                  Төлбөрийн мэдээлэл
                </CardTitle>
              </CardHeader>
              <div className="space-y-2.5">
                {[
                  { label: "Дэд нийлбэр", value: formatPrice(Number(order.subtotal)) },
                  { label: "Хөнгөлөлт", value: `−${formatPrice(Number(order.discount))}`, className: "text-green-600" },
                  { label: "Хүргэлт", value: formatPrice(Number(order.deliveryFee)) },
                  { label: "НӨАТ", value: formatPrice(Number(order.tax)) },
                  ...(order.coupon ? [{ label: `Купон (${order.coupon.code})`, value: `−${order.coupon.type === "PERCENTAGE" ? order.coupon.value + "%" : formatPrice(Number(order.coupon.value))}`, className: "text-green-600" }] : []),
                ].map((row) => (
                  <div key={row.label} className="flex justify-between text-sm text-slate-600">
                    <span>{row.label}</span>
                    <span className={row.className}>{row.value}</span>
                  </div>
                ))}
                <div className="border-t border-slate-100 pt-2.5 flex items-center justify-between font-bold text-slate-800">
                  <PaymentReceivedToggle orderId={order.id} paymentStatus={order.paymentStatus} />
                  <div className="flex items-center gap-3">
                    <span>Нийт дүн</span>
                    <span className="text-lg text-blue-600">{formatPrice(Number(order.total))}</span>
                  </div>
                </div>
              </div>
            </Card>

            {/* Audit log */}
            <Card>
              <CardHeader>
                <CardTitle>
                  <Clock className="w-4 h-4 inline mr-2 text-slate-400" />
                  Өөрчлөлтийн түүх
                </CardTitle>
              </CardHeader>
              <div className="space-y-3">
                {order.auditLogs.map((log) => (
                  <div key={log.id} className="flex items-start gap-3 text-sm">
                    <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-blue-600 text-xs font-bold">{log.user.name[0]}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-800">{log.user.name}</p>
                      <p className="text-slate-500">{log.action}</p>
                      {log.newValue && (
                        <p className="text-xs text-slate-400 font-mono mt-0.5 bg-slate-50 rounded px-2 py-1 truncate">
                          {log.newValue}
                        </p>
                      )}
                    </div>
                    <span className="text-xs text-slate-400 shrink-0">{formatDateTime(log.createdAt)}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Right: Customer + Actions */}
          <div className="space-y-5">
            {/* Customer */}
            <Card>
              <CardHeader>
                <CardTitle>
                  <User className="w-4 h-4 inline mr-2 text-blue-500" />
                  Харилцагч
                </CardTitle>
              </CardHeader>
              <div className="space-y-2.5 text-sm">
                <div>
                  <p className="font-semibold text-slate-800">{order.customer.name}</p>
                  <p className="text-slate-500">{order.customer.phone}</p>
                  {order.customer.email && <p className="text-slate-400">{order.customer.email}</p>}
                </div>
                {order.shippingAddress && (
                  <div className="flex items-start gap-2 text-slate-500 bg-slate-50 rounded-xl p-3">
                    <MapPin className="w-4 h-4 shrink-0 mt-0.5 text-slate-400" />
                    <span>{order.shippingAddress}</span>
                  </div>
                )}
              </div>
            </Card>

            {/* Delivery */}
            {order.delivery && (
              <Card>
                <CardHeader>
                  <CardTitle>Хүргэлтийн мэдээлэл</CardTitle>
                </CardHeader>
                <div className="space-y-2 text-sm text-slate-600">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Жолооч</span>
                    <span className="font-medium">{order.delivery.agent.user.name}</span>
                  </div>
                  {order.delivery.zone && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Бүс</span>
                      <span>{order.delivery.zone.name}</span>
                    </div>
                  )}
                  {order.delivery.trackingCode && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Трэкинг</span>
                      <span className="font-mono text-blue-600">{order.delivery.trackingCode}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-slate-400">Статус</span>
                    <Badge variant="info">{order.delivery.status}</Badge>
                  </div>
                </div>
              </Card>
            )}

            {/* Actions */}
            <OrderActions order={{ id: order.id, status: order.status, paymentStatus: order.paymentStatus }} />
          </div>
        </div>
      </div>
    </div>
  );
}
