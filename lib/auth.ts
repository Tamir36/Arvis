import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";

function normalizeAuthUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

const resolvedAuthUrl = normalizeAuthUrl(process.env.AUTH_URL ?? process.env.NEXTAUTH_URL);
if (resolvedAuthUrl) {
  process.env.AUTH_URL = resolvedAuthUrl;
  process.env.NEXTAUTH_URL = resolvedAuthUrl;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Нэвтрэх нэр эсвэл имэйл", type: "text" },
        password: { label: "Нууц үг", type: "password" },
      },
      async authorize(credentials) {
        const [{ prisma }, bcryptModule] = await Promise.all([
          import("@/lib/db"),
          import("bcryptjs"),
        ]);

        const bcrypt = bcryptModule.default;

        const parsed = z
          .object({
            email: z.string().min(3),
            password: z.string().min(4),
          })
          .safeParse(credentials);

        if (!parsed.success) return null;

        const { email: identifier, password } = parsed.data;

        const user = await prisma.user.findFirst({
          where: {
            isActive: true,
            OR: [
              { email: identifier },
              { name: identifier },
            ],
          },
        });

        if (!user) return null;

        const match = await bcrypt.compare(password, user.password);
        if (!match) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role: string }).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
      }
      return session;
    },
  },
});
