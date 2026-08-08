import React, { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Lock, Wrench, ShieldCheck, AlertTriangle } from "lucide-react";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import BrandMark from "@/components/BrandMark";
import { enforcedAttestation, silentAttestation } from "@/lib/silentAttestation";
import { probeCapabilities, isMobileDevice } from "@/lib/device";

const BG = "https://images.unsplash.com/photo-1496247749665-49cf5b1022e9?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2Mzl8MHwxfHNlYXJjaHwyfHxtZXRhbCUyMG1hbnVmYWN0dXJpbmclMjBtYWNoaW5lcnl8ZW58MHx8fHwxNzgwNzQ5Njg5fDA&ixlib=rb-4.1.0&q=85";

export default function Login() {
  const { login, verifyOtp, user } = useAuth();
  const { t } = useTranslation();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  // `verifying` flips on during the blocking attestation so we can show
  // a calm progress banner instead of a spinning button forever.
  const [verifying, setVerifying] = useState(false);
  // `caps` = result of capability probe. While null we treat the device
  // as not-yet-classified and the submit handler re-probes on demand.
  const [caps, setCaps] = useState(null);
  // ── Admin email OTP (second step) ──────────────────────────────
  const [otpStep, setOtpStep] = useState(false);
  const [challengeId, setChallengeId] = useState(null);
  const [sentTo, setSentTo] = useState(null);
  const [otpCode, setOtpCode] = useState("");

  React.useEffect(() => {
    let alive = true;
    probeCapabilities().then((c) => { if (alive) setCaps(c); });
    return () => { alive = false; };
  }, []);

  React.useEffect(() => {
    // Only auto-route when we're NOT in the middle of a blocking
    // attestation — the verification flow handles its own navigation.
    if (user && !verifying) nav("/");
  }, [user, nav, verifying]);

  // Post-authentication attestation + navigation. Shared by the password
  // step (non-admin) and the OTP step (admin) so both behave identically.
  const finishLogin = async () => {
    // ────────────────────────────────────────────────────────────────
    // Verification policy:
    //   • MOBILE / TABLET devices (phones, iPads) that also expose a
    //     camera + geolocation API → verification is MANDATORY.
    //   • DESKTOP / LAPTOP devices → SOFT: signed in immediately with a
    //     best-effort silent attestation running in the background.
    // IMPORTANT: enforcedAttestation() MUST run inside the submit handler
    // so it inherits the user-gesture context iOS Safari requires.
    // ────────────────────────────────────────────────────────────────
    const probed = caps || (await probeCapabilities());
    const mobile = isMobileDevice();
    if (mobile && probed?.camera && probed?.gps) {
      setVerifying(true);
      toast.success(t("login.loggedIn"));
      await enforcedAttestation();
      nav("/");
      return;
    }
    try { silentAttestation(); } catch (_) { /* ignore */ }
    toast.success(t("login.loggedIn"));
    nav("/");
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await login(email, password);
      // Admin accounts get an email OTP challenge — switch to step 2.
      if (res?.otpRequired) {
        setChallengeId(res.challengeId);
        setSentTo(res.sentTo);
        setOtpStep(true);
        setOtpCode("");
        toast.success(
          res.emailSent && res.sentTo
            ? `A login code was sent to ${res.sentTo}`
            : "A login code was generated. Check your email."
        );
        return;
      }
      await finishLogin();
    } catch (err) {
      toast.error(err?.response?.data?.detail || t("login.loginFailed"));
    } finally {
      setBusy(false);
    }
  };

  const submitOtp = async (e) => {
    e.preventDefault();
    if (!otpCode.trim()) return;
    setBusy(true);
    try {
      await verifyOtp(challengeId, otpCode.trim());
      await finishLogin();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Invalid code");
    } finally {
      setBusy(false);
    }
  };

  const backToLogin = () => {
    setOtpStep(false);
    setChallengeId(null);
    setSentTo(null);
    setOtpCode("");
  };

  const quickFill = (role) => {
    if (role === "admin") { setEmail("admin"); setPassword("admin123"); }
    else { setEmail("user"); setPassword("user123"); }
  };

  const heroTitle = t("login.heroTitle").split("\n");

  return (
    <div className="min-h-[100dvh] flex flex-col md:flex-row">
      {/* Left visual */}
      <div className="hidden md:flex md:w-1/2 relative" style={{ backgroundImage: `url(${BG})`, backgroundSize: "cover", backgroundPosition: "center" }}>
        <div className="absolute inset-0 bg-slate-900/80" />
        <div className="relative z-10 flex flex-col justify-between p-10 text-white w-full">
          <div className="flex items-center gap-3">
            <BrandMark size={40} variant="dark" />
            <span className="font-heading font-bold text-lg tracking-wide">{t("nav.brand")}</span>
          </div>
          <div>
            <p className="font-heading text-5xl font-bold leading-tight">{heroTitle[0]}</p>
            {heroTitle[1] && <p className="font-heading text-4xl font-bold leading-tight text-[#E65100]">{heroTitle[1]}</p>}
            <div className="mt-8 w-16 h-0.5 bg-[#E65100]" />
            <p className="mt-6 text-sm text-slate-300 max-w-md">{t("login.heroSubtitle")}</p>
          </div>
          <div className="text-[10px] uppercase tracking-widest text-slate-400">{t("login.heroFooter")}</div>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col">
        <div className="flex items-center justify-between p-4 sm:p-6">
          <div className="md:hidden flex items-center gap-2">
            <BrandMark size={32} variant="brand" />
            <span className="font-heading font-bold text-base text-slate-900">{t("nav.brand")}</span>
          </div>
          <div className="ml-auto"><LanguageSwitcher /></div>
        </div>
        <div className="flex-1 flex items-center justify-center px-4 sm:px-8 pb-8">
          <div className="w-full max-w-md">
            <div className="mb-8">
              <p className="text-xs uppercase font-bold tracking-widest text-[#E65100]">{t("login.welcome")}</p>
              <h1 className="font-heading text-3xl font-extrabold text-slate-900 mt-1">
                {otpStep ? "Enter code" : t("login.title")}
              </h1>
              <p className="text-sm text-slate-600 mt-2">
                {otpStep
                  ? (sentTo ? `We emailed a 6-digit login code to ${sentTo}.` : "Enter the 6-digit login code we emailed you.")
                  : t("login.subtitle")}
              </p>
            </div>

            {/* Verifying banner — visible while photo + GPS are being captured */}
            {verifying && (
              <div
                className="mb-4 bg-amber-50 border border-amber-300 rounded-sm px-3 py-2.5 flex items-start gap-2"
                data-testid="login-verifying-banner"
              >
                <ShieldCheck className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="text-xs">
                  <div className="font-bold text-amber-800">{t("attestation.capturing")}</div>
                  <div className="mt-0.5 text-[11px] text-slate-700 leading-relaxed">
                    Please allow Camera and Location when prompted. The app will sign you in as soon as both succeed.
                  </div>
                </div>
              </div>
            )}

            <form onSubmit={submit} className="space-y-4" style={{ display: otpStep ? "none" : "block" }}>
              <div>
                <Label className="text-xs uppercase font-bold tracking-wider text-slate-700">{t("login.username")}</Label>
                <Input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required={!otpStep}
                  disabled={busy || verifying}
                  data-testid="login-username-input"
                  className="h-12 rounded-sm mt-1 border-slate-300 focus:border-[#E65100] focus:ring-[#E65100]"
                  placeholder={t("login.username")}
                />
              </div>
              <div>
                <Label className="text-xs uppercase font-bold tracking-wider text-slate-700">{t("login.password")}</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required={!otpStep}
                  disabled={busy || verifying}
                  data-testid="login-password-input"
                  className="h-12 rounded-sm mt-1 border-slate-300 focus:border-[#E65100] focus:ring-[#E65100]"
                  placeholder="••••••••"
                />
              </div>
              <Button
                type="submit"
                disabled={busy || verifying}
                data-testid="login-submit-button"
                className="w-full h-12 rounded-sm bg-[#E65100] hover:bg-[#CC4800] text-white font-bold tracking-wide"
              >
                <Lock className="w-4 h-4 mr-2" />
                {verifying ? t("attestation.capturing") : (busy ? t("login.signingIn") : t("login.signIn"))}
              </Button>
            </form>

            {/* Step 2 — Admin email OTP */}
            {otpStep && (
              <form onSubmit={submitOtp} className="space-y-4">
                <div>
                  <Label className="text-xs uppercase font-bold tracking-wider text-slate-700">Login code</Label>
                  <Input
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
                    required
                    autoFocus
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    disabled={busy}
                    data-testid="login-otp-input"
                    className="h-12 rounded-sm mt-1 border-slate-300 tracking-[0.5em] text-center text-lg font-bold focus:border-[#E65100] focus:ring-[#E65100]"
                    placeholder="------"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={busy || otpCode.length < 6}
                  data-testid="login-otp-submit-button"
                  className="w-full h-12 rounded-sm bg-[#E65100] hover:bg-[#CC4800] text-white font-bold tracking-wide"
                >
                  <ShieldCheck className="w-4 h-4 mr-2" />
                  {busy ? "Verifying…" : "Verify & sign in"}
                </Button>
                <button
                  type="button"
                  onClick={backToLogin}
                  disabled={busy}
                  data-testid="login-otp-back"
                  className="w-full text-xs text-slate-500 hover:text-slate-800 underline"
                >
                  Use a different account
                </button>
              </form>
            )}

            {!otpStep && caps && !(caps.camera && caps.gps) && (
              <div
                className="mt-4 text-[11px] text-slate-500 flex items-start gap-1.5"
                data-testid="login-bypass-note"
              >
                <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                <span>
                  Verification bypassed on this device
                  {!caps.camera && " — no camera detected"}
                  {!caps.gps && " — no GPS / geolocation"}.
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
