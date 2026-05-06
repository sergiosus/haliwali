import { NextResponse } from "next/server";

export async function GET(req: Request) {
  void req;
  return NextResponse.json(
    { error: "PHONE_DISABLED" },
    { status: 410 },
  );
}
