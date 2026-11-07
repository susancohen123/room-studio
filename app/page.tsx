import { redirect } from "next/navigation";
import { isSignedIn, passwordOff } from "@/lib/auth";
import Studio from "@/components/Studio";

export const dynamic = "force-dynamic";

export default async function Page() {
  if (!(await isSignedIn())) redirect("/login");
  return <Studio canSignOut={!passwordOff()} />;
}
