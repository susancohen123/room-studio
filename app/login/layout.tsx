import { redirect } from "next/navigation";
import { passwordOff } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  if (passwordOff()) redirect("/");
  return children;
}
