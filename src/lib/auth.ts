import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import Credentials from 'next-auth/providers/credentials';
import type { Provider } from 'next-auth/providers';

const providers: Provider[] = [];

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    })
  );
}

providers.push(
  Credentials({
    id: 'email-password',
    name: 'Email & Password',
    credentials: {
      email: { label: 'Email', type: 'email' },
      password: { label: 'Password', type: 'password' },
    },
    async authorize(credentials) {
      if (!credentials?.email || !credentials?.password) return null;
      const { findUserByEmail, verifyPassword } = await import('@/lib/user-store');
      const email = String(credentials.email);
      const password = String(credentials.password);
      const user = await findUserByEmail(email);
      if (!user?.passwordHash) return null;
      const valid = await verifyPassword(password, user.passwordHash);
      if (!valid) return null;
      return {
        id: user.id,
        email: user.email,
        name: user.name || user.email,
        role: user.role,
      };
    },
  }),
  Credentials({
    id: 'kid-passphrase',
    name: 'Kid Passphrase',
    credentials: {
      passphrase: { label: 'Passphrase (word.word)', type: 'text' },
    },
    async authorize(credentials) {
      if (!credentials?.passphrase) return null;
      const passphrase = String(credentials.passphrase).trim().toLowerCase();
      const parts = passphrase.split('.');
      if (parts.length !== 2 || parts.some((p) => !/^[a-z]{4,}$/.test(p))) return null;
      const { hashPassphrase, findUserByPassphraseHash } = await import('@/lib/user-store');
      const hash = await hashPassphrase(passphrase);
      const user = await findUserByPassphraseHash(hash);
      if (!user) return null;
      return {
        id: user.id,
        name: user.name || 'Kid Builder',
        role: user.role,
      };
    },
  })
);

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  session: { strategy: 'jwt' },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role || 'adult';
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string }).id = token.id as string;
        (session.user as { role?: string }).role = token.role as string;
      }
      return session;
    },
  },
  pages: { signIn: '/auth/signin' },
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
  trustHost: true,
});
