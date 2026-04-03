import Header from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";

export default function FulfillmentPage() {
  return (
    <div>
      <Header title="Захиалга биелэлт" />

      <div className="p-5">
        <Card className="text-center py-16">
          <h3 className="text-lg font-semibold text-slate-800 mb-2">
            Pick List & Packing List
          </h3>
          <p className="text-slate-500">
            Захиалгуудыг авах, савлах жагсаалтыг үүсгэх системийн үзүүлэлт хэлбэрээр үйлдэл хийнэ.
          </p>
        </Card>
      </div>
    </div>
  );
}
