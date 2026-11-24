import type { Metadata } from "next";
import { Lockup } from "@/components/Logo";
import { getAuthConfig, MIN_PASSWORD_LENGTH, MIN_SESSION_SECRET_LENGTH, type AuthProblem } from "@/lib/server/env";
import { APP_NAME } from "@/lib/site";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

const Code = ({ children }: { children: string }) => (
  <code className="font-mono text-[0.95em] text-ink">{children}</code>
);

const PROBLEM: Record<AuthProblem, React.ReactNode> = {
  "missing-password": (
    <>
      Set <Code>ADMIN_PASSWORD</Code> in the server&apos;s environment (at least {MIN_PASSWORD_LENGTH} characters,
      for example from <Code>openssl rand -base64 18</Code>) and restart, then sign in with it.
    </>
  ),
  "short-password": (
    <>
      <Code>ADMIN_PASSWORD</Code> is shorter than {MIN_PASSWORD_LENGTH} characters. Set a longer one (for example from{" "}
      <Code>openssl rand -base64 18</Code>) and restart.
    </>
  ),
  "short-secret": (
    <>
      <Code>SESSION_SECRET</Code> is shorter than {MIN_SESSION_SECRET_LENGTH} characters. Set a random one (for example
      from <Code>openssl rand -base64 32</Code>), or remove it, and restart.
    </>
  ),
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const { problem } = getAuthConfig();

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      <Lockup size={34} className="mb-10" />
      <div className="panel w-full max-w-sm p-6 sm:p-8">
        <h1 className="display mb-2 text-[32px]">
          Sign <em>in</em>
        </h1>
        <p className="mb-8 text-sm text-muted">
          {problem ? `${APP_NAME} isn't set up yet.` : "Sign in with this deployment's admin password."}
        </p>
        {problem ? (
          <p role="alert" className="rounded-[10px] border border-danger/35 bg-danger/[0.07] px-3 py-3 text-[13px] leading-relaxed text-ink">
            {PROBLEM[problem]}
          </p>
        ) : (
          <LoginForm next={next} />
        )}
      </div>
    </main>
  );
}
