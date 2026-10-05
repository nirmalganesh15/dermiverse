import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { useState, type FormEvent } from "react";
import logo from "../assets/logo-mark.png";
import { Field, Spinner } from "../components/ui";
import { useAuth } from "../lib/auth";

export default function LoginPage() {
  const { signIn } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setError("Enter your username and password.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await signIn(username.trim(), password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel */}
      <div className="relative hidden overflow-hidden bg-espresso lg:flex lg:flex-col lg:items-center lg:justify-center">
        <div
          aria-hidden
          className="absolute inset-0 opacity-60"
          style={{
            background:
              "radial-gradient(60% 50% at 50% 42%, rgba(195,140,43,0.22) 0%, rgba(28,23,18,0) 70%), radial-gradient(40% 30% at 80% 90%, rgba(195,140,43,0.10) 0%, rgba(28,23,18,0) 70%)",
          }}
        />
        <div className="relative flex flex-col items-center px-12 text-center">
          <img src={logo} alt="Dr. Jansi's Dermverse monogram" className="h-44 w-auto drop-shadow-[0_10px_30px_rgba(195,140,43,0.35)]" />
          <div className="mt-10 font-display text-[2.6rem] font-semibold leading-none text-on-espresso">Dr. Jansi's Dermverse</div>
          <div className="mt-3 text-[0.78rem] font-semibold uppercase tracking-[0.3em] text-gold-300">Skin · Hair · Laser Clinic</div>
          <div className="gold-rule mt-8 w-56" />
          <p className="mt-6 max-w-sm text-[0.95rem] leading-relaxed text-on-espresso-2">
            Clinic management for billing, payments and patient care, made simple for every day at the clinic.
          </p>
        </div>
      </div>

      {/* Form */}
      <div className="flex items-center justify-center bg-ivory px-5 py-12">
        <div className="w-full max-w-[25rem]">
          <div className="mb-10 flex flex-col items-center text-center lg:hidden">
            <div className="rounded-2xl bg-espresso p-4">
              <img src={logo} alt="" className="h-16 w-auto" />
            </div>
            <div className="mt-4 font-display text-[1.9rem] font-semibold">Dr. Jansi's Dermverse</div>
          </div>
          <h1 className="t-display">Welcome back</h1>
          <p className="mt-2 text-ink-2">Sign in to continue to the clinic workspace.</p>

          <form onSubmit={submit} className="mt-8 space-y-5" noValidate>
            <Field label="Username">
              <input
                className="input !h-12"
                autoComplete="username"
                autoFocus
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </Field>
            <div>
              <Field label="Password" htmlFor="password">
                <div className="relative">
                  <input
                    id="password"
                    className="input !h-12 pr-12"
                    type={show ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShow((s) => !s)}
                    className="icon-btn absolute right-1.5 top-1/2 -translate-y-1/2"
                    aria-label={show ? "Hide password" : "Show password"}
                  >
                    {show ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </Field>
            </div>
            {error && (
              <p role="alert" className="rounded-xl border border-danger/25 bg-danger-bg px-4 py-3 text-[0.92rem] font-medium text-danger">
                {error}
              </p>
            )}
            <button type="submit" className="btn btn-primary btn-lg w-full" disabled={busy}>
              {busy ? <Spinner /> : null}
              Sign in
              {!busy && <ArrowRight size={18} aria-hidden />}
            </button>
          </form>
          <p className="mt-10 text-center text-[0.82rem] text-ink-3">
            Forgot your password? Ask the clinic administrator to reset it.
          </p>
        </div>
      </div>
    </div>
  );
}
