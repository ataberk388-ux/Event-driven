import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import { z } from "zod";
import { prisma } from "@synapse/db";
import { verifyPassword } from "@synapse/auth";
import { rateLimit } from "@synapse/ratelimit";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const githubEnabled = Boolean(process.env.GITHUB_ID && process.env.GITHUB_SECRET);

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  secret: process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (raw) => {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        // Throttle credential attempts per email to blunt brute-force.
        const limit = await rateLimit({
          key: `login:${parsed.data.email.toLowerCase()}`,
          limit: 10,
          windowSec: 60,
        });
        if (!limit.success) return null;

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email },
        });
        if (!user?.passwordHash) return null;
        if (!verifyPassword(parsed.data.password, user.passwordHash)) return null;

        return { id: user.id, name: user.name, email: user.email, image: user.image };
      },
    }),
    ...(githubEnabled
      ? [GitHub({ clientId: process.env.GITHUB_ID, clientSecret: process.env.GITHUB_SECRET })]
      : []),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.id = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.id && session.user) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
});
