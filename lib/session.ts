import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { todayIn } from "./dates";

/** For pages / server actions: returns the user id or redirects to login. */
export async function requireUser(): Promise<string> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) redirect("/login");
  return id;
}

/** For route handlers: returns the user id or null. */
export async function currentUser(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

/** The viewer's time zone (set by <TzCookie/>), used to decide what "today" is. */
export async function userTimeZone(): Promise<string> {
  const tz = (await cookies()).get("tz")?.value;
  if (tz) {
    try {
      new Intl.DateTimeFormat("en-CA", { timeZone: tz });
      return tz;
    } catch {}
  }
  return "UTC";
}

export async function userToday(): Promise<string> {
  return todayIn(await userTimeZone());
}
