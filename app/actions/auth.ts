"use server";

import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { sendWhatsAppMessage } from "@/lib/whatsapp/client";

const secretKey = process.env.JWT_SECRET || "fallback_secret_key_for_development";
const key = new TextEncoder().encode(secretKey);

export async function encrypt(payload: any) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(key);
}

export async function decrypt(input: string): Promise<any> {
  const { payload } = await jwtVerify(input, key, {
    algorithms: ["HS256"],
  });
  return payload;
}

export async function login(email: string, pass: string): Promise<{ success?: boolean; error?: string }> {
  const user = await prisma.teamMember.findUnique({
    where: { email },
  });

  if (!user || !user.password) {
    return { error: "Invalid credentials" };
  }

  const isValid = await bcrypt.compare(pass, user.password);
  if (!isValid) {
    return { error: "Invalid credentials" };
  }

  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const session = await encrypt({ user: { id: user.id, role: user.role, propertyId: user.propertyId } });

  const cookieStore = await cookies();
  cookieStore.set("auth-token", session, { expires, httpOnly: true });

  return { success: true };
}

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.set("auth-token", "", { expires: new Date(0) });
}

export async function verifyAndSignup(data: {
  name: string;
  phone: string;
  propertyId: string;
  role: string;
  email: string;
  pass: string;
}): Promise<{ success?: boolean; error?: string }> {
  // 1. Verify existence in DB exactly matching parameters
  const existingUser = await prisma.teamMember.findFirst({
    where: {
      name: data.name,
      phone: data.phone,
      propertyId: data.propertyId,
      role: data.role,
    },
  });

  if (!existingUser) {
    return { error: "No matching pre-authorized profile found. Check your details or contact your manager." };
  }

  if (existingUser.email) {
    return { error: "This profile has already been claimed." };
  }

  // 2. Hash password and update
  const hashedPassword = await bcrypt.hash(data.pass, 10);
  await prisma.teamMember.update({
    where: { id: existingUser.id },
    data: {
      email: data.email,
      password: hashedPassword,
    },
  });

  // Automatically log them in
  await login(data.email, data.pass);
  return { success: true };
}

export async function requestWhatsAppOTP(email: string): Promise<{ success: boolean; error?: string }> {
  const user = await prisma.teamMember.findUnique({
    where: { email },
  });

  if (!user) {
    // Return generic success to prevent email enumeration
    return { success: true };
  }

  // Generate 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

  await prisma.teamMember.update({
    where: { id: user.id },
    data: { resetCode: otp, resetCodeExpiry: expiry },
  });

  // Send via WhatsApp Twilio template
  await sendWhatsAppMessage(
    user.whatsappNumber || user.phone,
    "template",
    "",
    "staff_password_reset",
    "TeamMember",
    user.id,
    { "1": otp }
  );

  return { success: true };
}

export async function verifyOTPAndReset(email: string, otp: string, newPass: string): Promise<{ success?: boolean; error?: string }> {
  const user = await prisma.teamMember.findUnique({
    where: { email },
  });

  if (!user || !user.resetCode || !user.resetCodeExpiry) {
    return { error: "Invalid or expired request." };
  }

  if (user.resetCode !== otp) {
    return { error: "Invalid code." };
  }

  if (user.resetCodeExpiry < new Date()) {
    return { error: "Code has expired. Request a new one." };
  }

  const hashedPassword = await bcrypt.hash(newPass, 10);

  await prisma.teamMember.update({
    where: { id: user.id },
    data: {
      password: hashedPassword,
      resetCode: null,
      resetCodeExpiry: null,
    },
  });

  return { success: true };
}

export async function getSession() {
  const cookieStore = await cookies();
  const session = cookieStore.get("auth-token")?.value;
  if (!session) return null;
  try {
    return await decrypt(session);
  } catch {
    return null;
  }
}
