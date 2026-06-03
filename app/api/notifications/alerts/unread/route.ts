import { loadUnreadAlertCountForCurrentUser } from "@/lib/server/app-shell";

export async function GET() {
  const count = await loadUnreadAlertCountForCurrentUser();
  return Response.json({ count });
}
