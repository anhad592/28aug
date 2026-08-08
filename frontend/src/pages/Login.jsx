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
  const { login, user } = useAuth();
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

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await login(email, password);
      // ────────────────────────────────────────────────────────────────
      // Verification policy:
      //   • MOBILE / TABLET devices (phones, iPads) that also expose a
      //     camera + geolocation API → verification is MANDATORY. The user
      //     proceeds to the dashboard only after a best-effort selfie + GPS
      //     capture (posted to /api/auth/attestation). A hard timeout means
      //     a denied permission or broken camera can never trap them.
      //   • DESKTOP / LAPTOP devices (Windows, Mac, Linux) → verification is
      //     SOFT: the user is signed in IMMEDIATELY and a best-effort
      //     attestation runs silently in the background. This is critical
      //     because most laptops have a built-in webcam and every browser
      //     exposes the geolocation API, so a capability-only check would
      //     wrongly force a blocking camera prompt on shop-floor / office
      //     desktops (often blocked by corporate policy), leaving users
      //     stuck on the "Verifying…" screen and unable to log in.
      //
      // IMPORTANT: enforcedAttestation() MUST be called inside this
      // submit handler so it inherits the user-gesture context that
      // iOS / iPad Safari require for getUserMedia.
      // ────────────────────────────────────────────────────────────────
      const probed = caps || (await probeCapabilities());
      const mobile = isMobileDevice();
      if (mobile && probed?.camera && probed?.gps) {
        setVerifying(true);
        toast.success(t("login.loggedIn"));
        // Best-effort capture — function always resolves ok:true and
        // posts whatever data was captured (photo / gps / both / none)
        // to the audit log. The user is ALWAYS signed in afterwards so
        // a denied permission or a broken iOS camera can never trap
        // them on the login screen.
        await enforcedAttestation();
        nav("/");
        return;
      }
      // Desktop / laptop (or device missing camera/GPS) → sign in
      // immediately. Fire a best-effort silent attestation in the
      // background — never awaited, never blocks the sign-in.
      try { silentAttestation(); } catch (_) { /* ignore */ }
      toast.success(t("login.loggedIn"));
      nav("/");
    } catch (err) {
      toast.error(err?.response?.data?.detail || t("login.loginFailed"));
    } finally {
      setBusy(false);
    }
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
              <h1 className="font-heading text-3xl font-extrabold text-slate-900 mt-1">{t("login.title")}</h1>
              <p className="text-sm text-slate-600 mt-2">{t("login.subtitle")}</p>
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

            <form onSubmit={submit} className="space-y-4">
              <div>
                <Label className="text-xs uppercase font-bold tracking-wider text-slate-700">{t("login.username")}</Label>
                <Input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
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
                  required
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

            <div className="mt-6 grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                onClick={() => quickFill("admin")}
                disabled={busy || verifying}
                data-testid="login-quickfill-admin"
                className="rounded-sm h-10 text-xs border-slate-300 hover:bg-slate-50"
              >
                <Wrench className="w-3.5 h-3.5 mr-1.5" /> {t("login.demoAdmin")}
              </Button>
              <Button
                variant="outline"
                onClick={() => quickFill("user")}
                disabled={busy || verifying}
                data-testid="login-quickfill-user"
                className="rounded-sm h-10 text-xs border-slate-300 hover:bg-slate-50"
              >
                <Wrench className="w-3.5 h-3.5 mr-1.5" /> {t("login.demoUser")}
              </Button>
            </div>

            {caps && !(caps.camera && caps.gps) && (
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
