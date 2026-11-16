import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

/** Comma-separated GitHub usernames allowed to sign in, e.g. "octocat,friend". */
const allowed = (process.env.ALLOWED_GITHUB_USERS ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [GitHub],
  pages: { signIn: "/login", error: "/login" },
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 90 },
  callbacks: {
    signIn({ profile }) {
      const login = String(profile?.login ?? "").toLowerCase();
      return login !== "" && allowed.includes(login);
    },
    jwt({ token, profile }) {
      if (profile?.login) token.login = String(profile.login).toLowerCase();
      return token;
    },
    session({ session, token }) {
      if (token.login) session.user.id = String(token.login);
      return session;
    },
    authorized({ auth }) {
      return !!auth?.user;
    },
  },
});
