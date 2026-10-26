"use client"

import { useActionState } from "react"
import { motion } from "framer-motion"
import { Mail, Lock, ArrowRight, AlertCircle } from "lucide-react"
import { loginAction, type LoginState } from "@/app/actions/auth"
import { useTr } from "@/components/i18n/language-provider"
import { LanguageToggle } from "@/components/i18n/language-toggle"

// The sign-in form. Credentials are checked only on the server (app/actions/auth.ts); nothing secret is in here.
export function LoginForm({ next }: { next: string }) {
  const tr = useTr()
  const [state, formAction, isLoading] = useActionState<LoginState, FormData>(loginAction, { error: null })

  return (
    <div className="relative flex min-h-[100dvh] w-full bg-[#0a0a0a] text-white selection:bg-violet-500/30">
      <LanguageToggle className="absolute right-4 top-[calc(1rem+env(safe-area-inset-top))] z-20 border-white/10 bg-white/10 [&_[aria-checked=true]]:bg-white [&_[aria-checked=true]]:text-black [&_[aria-checked=false]]:text-white/70" />

      {/* Left side - Brand */}
      <div className="relative hidden w-1/2 flex-col bg-gradient-to-br from-[#0f0d1a] via-[#13112a] to-[#0d0b1e] p-12 lg:flex">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1566073771259-6a8506099945?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center opacity-[0.15] mix-blend-overlay" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0f0d1a] via-transparent to-transparent" />

        <div className="relative z-10 flex items-center gap-3">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-xl overflow-hidden shadow-lg shadow-violet-500/25">
            <img src="/logo.jpg" alt="Ritumbhara Logo" className="w-full h-full object-cover" />
          </div>
          <span className="text-xl font-bold tracking-tight">{tr("Hospitality OS")}</span>
        </div>

        <div className="relative z-10 mt-auto">
          <blockquote className="space-y-4">
            <p className="text-3xl font-medium leading-tight text-white/90">
              &ldquo;The most powerful operating system for modern hospitality management.&rdquo;
            </p>
            <footer className="text-sm font-medium text-slate-400 uppercase tracking-wider">
              {tr("Powered by Ritumbhara")}
            </footer>
          </blockquote>
        </div>
      </div>

      {/* Right side - Login Form */}
      <div className="flex w-full flex-col items-center justify-center p-8 lg:w-1/2">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-sm space-y-8"
        >
          {/* Mobile Header */}
          <div className="flex items-center gap-3 lg:hidden mb-12">
            <div className="relative flex h-10 w-10 items-center justify-center rounded-xl overflow-hidden shadow-lg shadow-violet-500/25">
              <img src="/logo.jpg" alt="Ritumbhara Logo" className="w-full h-full object-cover" />
            </div>
            <span className="text-xl font-bold tracking-tight">{tr("Hospitality OS")}</span>
          </div>

          <div className="space-y-2 text-center lg:text-left">
            <h1 className="text-3xl font-bold tracking-tight">{tr("Welcome back")}</h1>
            <p className="text-sm text-slate-400">
              {tr("Enter your credentials to access your dashboard")}
            </p>
          </div>

          <form action={formAction} className="space-y-4">
            <input type="hidden" name="next" value={next} />
            {state.error && (
              <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-200">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{state.error}</span>
              </div>
            )}
            <div className="space-y-4">
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  name="username"
                  defaultValue={state.username || ""}
                  autoComplete="username"
                  aria-label={tr("Username")}
                  placeholder={tr("Username")}
                  autoCapitalize="none"
                  spellCheck={false}
                  className="w-full rounded-xl border border-white/10 bg-white/5 py-3 pl-11 pr-4 text-sm text-white placeholder:text-slate-500 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 transition-all"
                  required
                />
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
                <input
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  aria-label={tr("Password")}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-white/10 bg-white/5 py-3 pl-11 pr-4 text-sm text-white placeholder:text-slate-500 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 transition-all"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="group relative flex w-full items-center justify-center gap-2 rounded-xl bg-white py-3 text-sm font-semibold text-black transition-all hover:bg-slate-200 disabled:opacity-70"
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/20 border-t-black" />
                  {tr("Authenticating...")}
                </span>
              ) : (
                <>
                  {tr("Sign In")}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </>
              )}
            </button>
          </form>

          <p className="text-center text-xs text-slate-500 lg:text-left">
            {tr("By clicking continue, you agree to our Terms of Service and Privacy Policy.")}
          </p>
        </motion.div>
      </div>
    </div>
  )
}
