export async function GET() {
  return Response.json(
    {
      ok: false,
      error: "gone",
      message: "Legacy settlements JSON search endpoint removed. Use /api/cities (PostgreSQL).",
    },
    { status: 410 },
  );
}

