import { NextResponse } from "next/server";
import { joinMembership } from "@/app/actions/membership";

// Guest portal: enrol the guest of this reservation as a Star member. No points are credited here; they are earned
// after check-out (lib/loyalty/earning.ts).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let code: string | undefined;
  try {
    const body = await request.json();
    if (body && typeof body.referralCode === "string") code = body.referralCode;
  } catch {
    // no body
  }
  const res = await joinMembership(id, code);
  if (!res.success) {
    const status = res.error === "Booking not found." ? 404 : 400;
    return NextResponse.json({ error: res.error }, { status });
  }
  return NextResponse.json({ success: true, membershipNumber: res.membershipNumber, warning: res.warning });
}
