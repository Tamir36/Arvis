import { prisma } from "@/lib/db";
import Header from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";
import DataTable from "@/components/ui/DataTable";
import Link from "next/link";
import { Users, Eye } from "lucide-react";
import { formatDate } from "@/lib/utils";

export default async function CustomersPage() {
  const customers = await prisma.customer.findMany({
    include: {
      _count: { select: { orders: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const columns = [
    {
      key: "name",
      header: "Нэр",
      render: (v: unknown) => <span className="font-medium">{v as string}</span>,
    },
    {
      key: "phone",
      header: "Утас",
      render: (v: unknown) => <span className="font-mono text-sm">{v as string}</span>,
    },
    {
      key: "address",
      header: "Хаяг",
      render: (v: unknown) => (v ? <span className="text-slate-500">{v as string}</span> : <span className="text-slate-300">-</span>),
    },
    {
      key: "createdAt",
      header: "Бүртгэлтэй",
      render: (v: unknown) => <span className="text-slate-400 text-xs">{formatDate(v as Date)}</span>,
    },
  ];

  return (
    <div>
      <Header title="Харилцагч" subtitle={`Нийт ${customers.length}`} />

      <div className="p-5">
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Нэр</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Утас</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Имэйл</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Хотын</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Захиалга</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Огноо</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {customers.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-medium">{c.name}</td>
                    <td className="px-4 py-3 font-mono text-sm">{c.phone}</td>
                    <td className="px-4 py-3">{c.email ?? "-"}</td>
                    <td className="px-4 py-3">{c.city ?? "-"}</td>
                    <td className="px-4 py-3 font-semibold text-blue-600">{c._count.orders}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{formatDate(c.createdAt)}</td>
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
