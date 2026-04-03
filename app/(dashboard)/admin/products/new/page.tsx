"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Header from "@/components/layout/Header";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { Trash2, ArrowLeft, Save, Image as ImageIcon } from "lucide-react";
import toast from "react-hot-toast";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";

const productSchema = z.object({
  name: z.string().min(1, "Нэр заавал оруулна уу"),
  categoryId: z.string().optional(),
  basePrice: z.coerce.number().min(0, "Үнэ заавал оруулна уу"),
  status: z.enum(["ACTIVE", "DRAFT"]),
  quantity: z.coerce.number().min(0).default(0),
});

type ProductForm = z.infer<typeof productSchema>;

interface Category {
  id: string;
  name: string;
}

interface ProductFormPageProps {
  params?: { id: string };
  isEdit?: boolean;
}

export default function NewProductPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ProductForm>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      status: "DRAFT",
      quantity: 0,
    },
  });

  // Rich text editor
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: "Барааны тайлбар оруулна уу..." }),
    ],
    editorProps: {
      attributes: { class: "ProseMirror" },
    },
  });

  useEffect(() => {
    fetch("/api/categories").then((r) => r.json()).then((d) => setCategories(d.data ?? []));
  }, []);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    setImageFiles((prev) => [...prev, ...files]);
    files.forEach((f) => {
      const reader = new FileReader();
      reader.onloadend = () => setImagePreviews((prev) => [...prev, reader.result as string]);
      reader.readAsDataURL(f);
    });
  };

  const removeImage = (idx: number) => {
    setImageFiles((prev) => prev.filter((_, i) => i !== idx));
    setImagePreviews((prev) => prev.filter((_, i) => i !== idx));
  };

  const onSubmit = async (data: ProductForm) => {
    setIsSaving(true);
    try {
      // Upload images first
      const uploadedUrls: string[] = [];
      for (const file of imageFiles) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        if (res.ok) {
          const { url } = await res.json();
          uploadedUrls.push(url);
        }
      }

      const body = {
        ...data,
        description: editor?.getHTML() ?? "",
        images: uploadedUrls,
      };

      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Алдаа гарлаа");
      }

      toast.success("Бараа амжилттай нэмэгдлээ");
      router.push("/admin/products");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Алдаа гарлаа");
    } finally {
      setIsSaving(false);
    }
  };

  const categoryOptions = [
    { value: "", label: "Ангилал сонгох" },
    ...categories.map((c) => ({ value: c.id, label: c.name })),
  ];

  const statusOptions = [
    { value: "ACTIVE", label: "Идэвхтэй" },
    { value: "DRAFT", label: "Идэвхгүй" },
  ];

  return (
    <div>
      <Header title="Шинэ бараа нэмэх" />

      <div className="p-5">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 max-w-4xl">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Main info */}
            <div className="lg:col-span-2 space-y-5">
              <Card>
                <CardHeader>
                  <CardTitle>Үндсэн мэдээлэл</CardTitle>
                </CardHeader>

                <div className="space-y-4">
                  <Input
                    label="Барааны нэр"
                    placeholder="Барааны нэр оруулна уу"
                    required
                    error={errors.name?.message}
                    {...register("name")}
                  />

                  {/* Description */}
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700">Тайлбар</label>
                    <div className="border border-slate-200 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent">
                      {/* Toolbar */}
                      <div className="flex items-center gap-1 px-3 py-2 border-b border-slate-100 bg-slate-50">
                        {[
                          { label: "B", action: () => editor?.chain().focus().toggleBold().run(), title: "Тод" },
                          { label: "I", action: () => editor?.chain().focus().toggleItalic().run(), title: "Налуу" },
                          { label: "H2", action: () => editor?.chain().focus().toggleHeading({ level: 2 }).run(), title: "Толгой 2" },
                          { label: "UL", action: () => editor?.chain().focus().toggleBulletList().run(), title: "Жагсаалт" },
                        ].map((btn) => (
                          <button
                            key={btn.label}
                            type="button"
                            title={btn.title}
                            onClick={btn.action}
                            className="px-2.5 py-1 text-xs font-medium rounded-lg text-slate-600 hover:bg-white hover:shadow-sm transition-all"
                          >
                            {btn.label}
                          </button>
                        ))}
                      </div>
                      <EditorContent editor={editor} />
                    </div>
                  </div>
                </div>
              </Card>

              {/* Images */}
              <Card>
                <CardHeader>
                  <CardTitle>Зураг</CardTitle>
                </CardHeader>
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-3">
                    {imagePreviews.map((src, i) => (
                      <div key={i} className="relative w-24 h-24 rounded-xl overflow-hidden border border-slate-200 group">
                        <img src={src} alt="" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => removeImage(i)}
                          className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                        >
                          <Trash2 className="w-4 h-4 text-white" />
                        </button>
                      </div>
                    ))}
                    <label className="w-24 h-24 rounded-xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors">
                      <ImageIcon className="w-5 h-5 text-slate-400" />
                      <span className="text-xs text-slate-400 mt-1">Нэмэх</span>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={handleImageChange}
                      />
                    </label>
                  </div>
                  <p className="text-xs text-slate-400">PNG, JPG, WEBP. Нэг удаад олон зураг сонгож болно.</p>
                </div>
              </Card>

            </div>

            {/* Sidebar info */}
            <div className="space-y-5">
              <Card>
                <CardHeader>
                  <CardTitle>Тохиргоо</CardTitle>
                </CardHeader>
                <div className="space-y-4">
                  <Select
                    label="Статус"
                    options={statusOptions}
                    {...register("status")}
                  />
                  <Select
                    label="Ангилал"
                    options={categoryOptions}
                    {...register("categoryId")}
                  />
                </div>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Үнэ</CardTitle>
                </CardHeader>
                <div className="space-y-4">
                  <Input
                    label="Үнэ (₮)"
                    type="number"
                    placeholder="0"
                    required
                    error={errors.basePrice?.message}
                    {...register("basePrice")}
                  />
                </div>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Агуулах</CardTitle>
                </CardHeader>
                <div className="space-y-4">
                  <Input label="Тоо ширхэг" type="number" placeholder="0" {...register("quantity")} />
                </div>
              </Card>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="flex-1"
                  leftIcon={<ArrowLeft className="w-4 h-4" />}
                  onClick={() => router.back()}
                >
                  Буцах
                </Button>
                <Button
                  type="submit"
                  className="flex-1"
                  isLoading={isSaving}
                  leftIcon={<Save className="w-4 h-4" />}
                >
                  Хадгалах
                </Button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
