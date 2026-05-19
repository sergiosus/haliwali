/** Avoid static RSC payloads that can reference stale Server Action ids after deploy. */
export const dynamic = "force-dynamic";

export default function MapLayout({ children }: { children: React.ReactNode }) {
  return children;
}
