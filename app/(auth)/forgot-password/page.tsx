"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { requestWhatsAppOTP, verifyOTPAndReset } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");

  const handleRequestOTP = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await requestWhatsAppOTP(email);
      if (res.error) {
        setError(res.error);
      } else {
        toast.success("Verification code sent to your registered WhatsApp!");
        setStep(2);
      }
    } catch (err) {
      setError("Failed to send code");
    }
    setLoading(false);
  };

  const handleResetPassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const otp = formData.get("otp") as string;
    const pass = formData.get("password") as string;
    const confirmPass = formData.get("confirmPassword") as string;

    if (pass !== confirmPass) {
      setError("Passwords do not match");
      setLoading(false);
      return;
    }

    try {
      const res = await verifyOTPAndReset(email, otp, pass);
      if (res.error) {
        setError(res.error);
      } else {
        toast.success("Password reset successfully! You can now log in.");
        router.push("/login");
      }
    } catch (err) {
      setError("Failed to reset password");
    }
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h2 className="text-xl font-semibold tracking-tight">Reset Password</h2>
        <p className="text-sm text-muted-foreground">
          {step === 1 ? "Enter your email to receive a WhatsApp verification code" : "Enter the 6-digit code sent to your WhatsApp"}
        </p>
      </div>

      {step === 1 ? (
        <form onSubmit={handleRequestOTP} className="space-y-4">
          {error && (
            <div className="p-3 text-sm text-red-500 bg-red-50 dark:bg-red-950/50 rounded-lg border border-red-200 dark:border-red-900">
              {error}
            </div>
          )}
          
          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <Input id="email" type="email" placeholder="john@example.com" required disabled={loading} value={email} onChange={e => setEmail(e.target.value)} />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Send Code via WhatsApp"}
          </Button>
        </form>
      ) : (
        <form onSubmit={handleResetPassword} className="space-y-4">
          {error && (
            <div className="p-3 text-sm text-red-500 bg-red-50 dark:bg-red-950/50 rounded-lg border border-red-200 dark:border-red-900">
              {error}
            </div>
          )}
          
          <div className="space-y-2">
            <Label htmlFor="otp">6-Digit Code</Label>
            <Input id="otp" name="otp" placeholder="123456" required disabled={loading} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">New Password</Label>
            <Input id="password" name="password" type="password" required disabled={loading} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm New Password</Label>
            <Input id="confirmPassword" name="confirmPassword" type="password" required disabled={loading} />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Reset Password"}
          </Button>
        </form>
      )}

      <div className="text-center text-sm">
        Remember your password?{" "}
        <Link href="/login" className="text-primary hover:underline font-medium">
          Sign In
        </Link>
      </div>
    </div>
  );
}
