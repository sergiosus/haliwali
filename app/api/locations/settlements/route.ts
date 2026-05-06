export async function GET(req: Request) {
  return Response.json(
    {
      ok: false,
      error: "gone",
      message: "Legacy settlements JSON endpoint removed. Use /api/cities (PostgreSQL).",
    },
    { status: 410 },
  );
}

