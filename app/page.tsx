import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export default async function HomePage() {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  const role = session.user?.role;

  if (role === "ADMIN") redirect("/admin");
  if (role === "OPERATOR") redirect("/operator");
  if (role === "DRIVER") redirect("/driver");

  redirect("/login");
}
