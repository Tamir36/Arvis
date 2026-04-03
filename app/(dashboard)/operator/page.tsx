import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import Header from "@/components/layout/Header";
import StatsCard from "@/components/ui/StatsCard";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import Badge, { orderStatusBadge } from "@/components/ui/Badge";
import { formatPrice, formatDateTime } from "@/lib/utils";
import { ShoppingCart, Clock, CheckCircle2, AlertCircle } from "lucide-react";
import { mn } from "@/locales/mn";

export default async function OperatorDashboard() {
  const session = await auth();
  if (!session) return null;

  const [totalOrders, pendingOrders, packedOrders, recentOrders] = await Promise.all([
    prisma.order.count(),
    prisma.order.count({ where: { status: "PENDING" } }),
    prisma.order.count({ where: { status: "PACKED" } }),
    prisma.order.findMany({
      take: 10,
      orderBy: { createdAt: "desc" },
      include: { customer: { select: { name: true } } },
    }),
  ]);

  return (
    <div>
      <Header
        title="Хянах самбар"
        subtitle={`Тавтай морил, ${session.user?.name}`}
      />

      <div className="p-5 space-y-5">
        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatsCard
            title="Нийт захиалга"
            value={totalOrders}
            icon={<ShoppingCart className="w-5 h-5" />}
            color="blue"
          />
          <StatsCard
            title="Хүлээгдэж байгаа"
            value={pendingOrders}
            icon={<Clock className="w-5 h-5" />}
            color="orange"
          />
          <StatsCard
            title="Савласан"
            value={packedOrders}
            icon={<CheckCircle2 className="w-5 h-5" />}
            color="green"
          />
          <StatsCard
            title="Идэвхтэй эргүүлэлт"
            value={recentOrders.length}
            icon={<AlertCircle className="w-5 h-5" />}
            color="purple"
          />
        </div>

        {/* Recent orders */}
        <Card>
          <CardHeader>
            <CardTitle>Сүүлийн захиалгууд</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left p-3 text-xs font-semibold text-slate-400">Дугаар</th>
                  <th className="text-left p-3 text-xs font-semibold text-slate-400">Харилцагч</th>
                  <th className="text-left p-3 text-xs font-semibold text-slate-400">Статус</th>
                  <th className="text-left p-3 text-xs font-semibold text-slate-400">Огноо</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {recentOrders.map((o) => (
                  <tr key={o.id} className="hover:bg-slate-50/50">
                    <td className="p-3 font-medium text-blue-600">{o.orderNumber}</td>
                    <td className="p-3">{o.customer.name}</td>
                    <td className="p-3">
                      <Badge variant={orderStatusBadge(o.status)}>
                        {mn.status[o.status as keyof typeof mn.status]}
                      </Badge>
                    </td>
                    <td className="p-3 text-slate-400 text-xs">{formatDateTime(o.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
