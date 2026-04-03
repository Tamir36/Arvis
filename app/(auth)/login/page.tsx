"use client";

import { useState } from "react";
import { getSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, ShoppingBag, Loader2 } from "lucide-react";

const loginSchema = z.object({
  identifier: z.string().min(3, "Нэвтрэх нэр эсвэл имэйл оруулна уу"),
  password: z.string().min(4, "Нууц үг хамгийн багадаа 4 тэмдэгт байх ёстой"),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginForm) => {
    setError(null);
    try {
      const result = await signIn("credentials", {
        email: data.identifier,
        password: data.password,
        redirect: false,
      });

      if (result?.error) {
        setError("Нэвтрэх нэр/имэйл эсвэл нууц үг буруу байна");
        return;
      }

      if (!result || result.ok !== true) {
        setError("Нэвтрэх боломжгүй байна. Дахин оролдоно уу.");
        return;
      }

      const session = await getSession();
      if (!session?.user?.id) {
        setError("Нэвтрэлт амжилтгүй боллоо. Мэдээллээ шалгаад дахин оролдоно уу.");
        return;
      }

      // Redirect based on role (Next.js will handle via middleware)
      router.push("/");
      router.refresh();
    } catch {
      setError("Системийн алдаа гарлаа. Дахин оролдоно уу.");
    }
  };

  return (
    <div className="w-full max-w-md">
      {/* Logo */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl shadow-lg mb-4">
          <ShoppingBag className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-slate-800">Arvis Shop</h1>
        <p className="text-slate-500 mt-1 text-sm">Удирдлагын систем</p>
      </div>

      {/* Card */}
      <div className="bg-white rounded-2xl shadow-xl p-8 border border-slate-100">
        <h2 className="text-xl font-semibold text-slate-800 mb-6">Нэвтрэх</h2>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
              <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              {error}
            </div>
          )}

          {/* Identifier */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Нэвтрэх нэр эсвэл имэйл
            </label>
            <input
              {...register("identifier")}
              type="text"
              autoComplete="username"
              placeholder="admin эсвэл admin@arvis.mn"
              className={`w-full px-4 py-3 rounded-xl border text-slate-800 placeholder-slate-400 
                focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all
                ${errors.identifier ? "border-red-300 bg-red-50" : "border-slate-200 bg-slate-50 hover:border-slate-300"}`}
            />
            {errors.identifier && (
              <p className="mt-1.5 text-xs text-red-600">{errors.identifier.message}</p>
            )}
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Нууц үг
            </label>
            <div className="relative">
              <input
                {...register("password")}
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="••••••••"
                className={`w-full px-4 py-3 pr-12 rounded-xl border text-slate-800 placeholder-slate-400
                  focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all
                  ${errors.password ? "border-red-300 bg-red-50" : "border-slate-200 bg-slate-50 hover:border-slate-300"}`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            {errors.password && (
              <p className="mt-1.5 text-xs text-red-600">{errors.password.message}</p>
            )}
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold 
              rounded-xl transition-all duration-200 flex items-center justify-center gap-2 shadow-sm
              focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Нэвтэрч байна...
              </>
            ) : (
              "Нэвтрэх"
            )}
          </button>
        </form>

        {/* Demo accounts */}
        <div className="mt-6 pt-6 border-t border-slate-100">
          <p className="text-xs font-medium text-slate-500 mb-3">Туршилтын бүртгэл:</p>
          <div className="space-y-2">
            {[
              { role: "Админ", email: "admin@arvis.mn", pw: "admin123", color: "blue" },
              { role: "Оператор", email: "operator@arvis.mn", pw: "operator123", color: "indigo" },
              { role: "Жолооч", email: "driver@arvis.mn", pw: "driver123", color: "orange" },
            ].map((acc) => (
              <div
                key={acc.email}
                className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2 text-xs"
              >
                <span className={`font-medium text-${acc.color}-600`}>{acc.role}</span>
                <span className="text-slate-500">{acc.email}</span>
                <span className="font-mono text-slate-600">{acc.pw}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <p className="text-center text-xs text-slate-400 mt-6">
        © 2024 Arvis Shop. Бүх эрх хуулиар хамгаалагдсан.
      </p>
    </div>
  );
}
