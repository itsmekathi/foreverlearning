import { signIn } from "@/auth";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; callbackUrl?: string }> }) {
  const { error, callbackUrl } = await searchParams;
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-accent text-2xl text-white">
          ∞
        </div>
        <h1 className="text-xl font-semibold">ForeverLearning</h1>
        <p className="mt-1 text-sm text-muted">Your library, your pace.</p>
        {error && (
          <p className="mt-4 rounded-lg bg-red-50 p-2 text-sm text-red-700">
            {error === "AccessDenied" ? "This GitHub account isn't on the allowed list." : "Sign-in failed. Try again."}
          </p>
        )}
        <form
          className="mt-6"
          action={async () => {
            "use server";
            await signIn("github", { redirectTo: callbackUrl || "/" });
          }}
        >
          <button className="w-full rounded-xl bg-fg px-4 py-3 font-medium text-bg hover:opacity-90">
            Continue with GitHub
          </button>
        </form>
      </div>
    </main>
  );
}
