import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import clsx from "clsx";
import { format } from "date-fns";
import {
  BarChart3,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  FilePlus2,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Pill as PillIcon,
  Receipt,
  RotateCcw,
  Search,
  Settings,
  Sparkles,
  Stethoscope,
  Tags,
  UserCog,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import logo from "../assets/logo-mark.png";
import { useAuth, useClinic } from "../lib/auth";
import { initials } from "../lib/format";

type NavItem = { to: string; label: string; icon: typeof Receipt; soon?: boolean; end?: boolean };

/** Full clinic-system navigation. Billing is live; other modules are shown so staff see what's coming. */
const NAV: { heading?: string; items: NavItem[] }[] = [
  { items: [{ to: "/", label: "Dashboard", icon: LayoutDashboard, end: true }] },
  {
    heading: "Billing",
    items: [
      { to: "/invoices/new", label: "New invoice", icon: FilePlus2 },
      { to: "/invoices", label: "Invoices", icon: FileText, end: true },
      { to: "/payments", label: "Payments", icon: Wallet },
      { to: "/refunds", label: "Refunds", icon: RotateCcw },
      { to: "/services", label: "Services & prices", icon: Tags },
      { to: "/reports", label: "Reports", icon: BarChart3 },
    ],
  },
  {
    heading: "Clinic",
    items: [
      { to: "/appointments", label: "Appointments", icon: CalendarDays, soon: true },
      { to: "/patients", label: "Patients", icon: Users, soon: true },
      { to: "/consultations", label: "Consultations", icon: Stethoscope, soon: true },
      { to: "/treatment-plans", label: "Treatment plans", icon: Sparkles, soon: true },
      { to: "/pharmacy", label: "Pharmacy", icon: PillIcon, soon: true },
      { to: "/inventory", label: "Inventory", icon: Package, soon: true },
      { to: "/staff", label: "Staff", icon: UserCog, soon: true },
    ],
  },
];

function Brand({ compact }: { compact?: boolean }) {
  const clinic = useClinic();
  return (
    <div className="flex items-center gap-3">
      <img src={logo} alt="" className={clsx("shrink-0 drop-shadow", compact ? "h-9 w-auto" : "h-11 w-auto")} />
      <div className="min-w-0 leading-tight">
        <div className={clsx("truncate font-display font-semibold text-on-espresso", compact ? "text-[1.2rem]" : "text-[1.35rem]")}>
          Dermverse
        </div>
        <div className="text-[0.64rem] font-semibold uppercase leading-snug tracking-[0.12em] text-gold-300">
          {clinic.data?.subtitle || "Skin, Hair & Laser Clinic"}
        </div>
      </div>
    </div>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Main" className="flex h-full flex-col">
      <div className="px-5 pb-5 pt-6">
        <Brand />
      </div>
      <div className="mx-5 h-px bg-gradient-to-r from-gold-500/50 via-gold-500/20 to-transparent" />
      <div className="flex-1 overflow-y-auto px-3 py-4">
        {NAV.map((group, gi) => (
          <div key={gi} className={clsx(gi > 0 && "mt-5")}>
            {group.heading && (
              <div className="mb-1.5 px-3 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-on-espresso-2/80">
                {group.heading}
              </div>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      clsx(
                        "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[0.93rem] transition-colors",
                        isActive
                          ? "bg-espresso-3/70 font-semibold text-white"
                          : item.soon
                            ? "text-on-espresso-2 hover:bg-espresso-2 hover:text-on-espresso"
                            : "text-on-espresso hover:bg-espresso-2 hover:text-white",
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && (
                          <span aria-hidden className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-gold-400" />
                        )}
                        <item.icon
                          size={18}
                          strokeWidth={isActive ? 2.2 : 1.8}
                          className={clsx(isActive ? "text-gold-300" : "text-on-espresso-2 group-hover:text-gold-300")}
                          aria-hidden
                        />
                        <span className="flex-1">{item.label}</span>
                        {item.soon && (
                          <span className="rounded-full border border-on-espresso-2/30 px-1.5 py-px text-[0.64rem] font-semibold uppercase tracking-wider text-on-espresso-2">
                            Soon
                          </span>
                        )}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-espresso-3 px-3 py-3">
        <NavLink
          to="/settings"
          onClick={onNavigate}
          className={({ isActive }) =>
            clsx(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-[0.93rem] transition-colors",
              isActive ? "bg-espresso-3/70 font-semibold text-white" : "text-on-espresso hover:bg-espresso-2",
            )
          }
        >
          <Settings size={18} className="text-on-espresso-2" aria-hidden />
          Settings
        </NavLink>
      </div>
    </nav>
  );
}

function UserMenu() {
  const { user, signOut } = useAuth();
  if (!user) return null;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="flex items-center gap-2.5 rounded-xl py-1 pl-1 pr-2 transition-colors hover:bg-sand">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-gold-300 to-gold-600 text-[0.85rem] font-semibold text-ink ring-2 ring-white">
          {initials(user.display_name)}
        </span>
        <span className="hidden text-left leading-tight lg:block">
          <span className="block text-[0.9rem] font-semibold">{user.display_name}</span>
          <span className="block text-[0.76rem] text-ink-3">{user.role_label}</span>
        </span>
        <ChevronDown size={16} className="text-ink-3" aria-hidden />
        <span className="sr-only">Account menu</span>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="anim-pop z-50 min-w-56 rounded-xl border border-line bg-white p-1.5 shadow-[var(--shadow-pop)]"
        >
          <div className="px-3 py-2">
            <div className="font-semibold">{user.display_name}</div>
            <div className="text-[0.82rem] text-ink-3">Signed in as {user.username}</div>
          </div>
          <DropdownMenu.Separator className="my-1 h-px bg-line" />
          <DropdownMenu.Item
            onSelect={signOut}
            className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-[0.92rem] outline-none data-[highlighted]:bg-cream"
          >
            <LogOut size={16} aria-hidden /> Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function GlobalSearch() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    navigate(`/invoices${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`);
    setQ("");
  };
  return (
    <form role="search" onSubmit={submit} className="relative hidden w-full max-w-md md:block">
      <label htmlFor="global-search" className="sr-only">
        Find an invoice
      </label>
      <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3" aria-hidden />
      <input
        id="global-search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Find invoice by patient, phone or number"
        className="input !h-10 !rounded-full !border-line bg-white/80 !pl-10"
      />
    </form>
  );
}

export function AppShell() {
  const [drawer, setDrawer] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const mainRef = useRef<HTMLElement>(null);
  const onNewInvoice = location.pathname === "/invoices/new";

  useEffect(() => {
    setDrawer(false);
    mainRef.current?.scrollTo?.({ top: 0 });
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  // Alt+N anywhere opens a new invoice: the most common action at the front desk.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === "n" || e.key === "N")) {
        e.preventDefault();
        navigate("/invoices/new");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  return (
    <div className="min-h-dvh lg:pl-[17rem]">
      <a href="#main" className="sr-only-focusable fixed left-3 top-3 z-[60] rounded-lg bg-white px-4 py-2 font-semibold shadow">
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[17rem] bg-espresso lg:block">
        <Sidebar />
      </aside>

      {/* Mobile / tablet drawer */}
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="anim-overlay absolute inset-0 bg-espresso/50" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 left-0 w-[17.5rem] max-w-[85vw] bg-espresso shadow-2xl">
            <button
              onClick={() => setDrawer(false)}
              className="absolute right-3 top-6 grid h-9 w-9 place-items-center rounded-lg text-on-espresso hover:bg-espresso-2"
              aria-label="Close menu"
            >
              <X size={20} />
            </button>
            <Sidebar onNavigate={() => setDrawer(false)} />
          </aside>
        </div>
      )}

      <header className="sticky top-0 z-20 border-b border-line/80 bg-ivory/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-3 px-4 sm:px-6 lg:px-8">
          <button className="icon-btn lg:hidden" onClick={() => setDrawer(true)} aria-label="Open menu">
            <Menu size={22} />
          </button>
          <div className="flex items-center gap-2 lg:hidden">
            <img src={logo} alt="" className="h-8 w-auto" />
            <span className="font-display text-[1.25rem] font-semibold">Dermverse</span>
          </div>
          <GlobalSearch />
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <span className="hidden text-[0.86rem] text-ink-3 xl:inline">{format(new Date(), "EEEE, d MMMM")}</span>
            {!onNewInvoice && (
              <NavLink to="/invoices/new" className="btn btn-gold btn-sm sm:!h-10 sm:!px-4" title="New invoice (Alt+N)">
                <FilePlus2 size={17} aria-hidden />
                <span className="hidden sm:inline">New invoice</span>
                <span className="sr-only sm:hidden">New invoice</span>
              </NavLink>
            )}
            <UserMenu />
          </div>
        </div>
      </header>

      <main id="main" ref={mainRef} className="mx-auto max-w-[1400px] px-4 pb-16 pt-6 sm:px-6 sm:pt-8 lg:px-8">
        <Outlet />
      </main>
    </div>
  );
}

export function ComingSoon({ title, icon: Icon = ClipboardList }: { title: string; icon?: typeof Receipt }) {
  return (
    <div className="card mx-auto mt-6 max-w-2xl overflow-hidden">
      <div className="relative bg-espresso px-8 py-10 text-center">
        <img src={logo} alt="" className="mx-auto h-16 w-auto opacity-90" />
        <div className="gold-rule mx-auto mt-6 w-40" />
      </div>
      <div className="px-8 py-9 text-center">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl bg-gold-50 text-gold-700 ring-1 ring-gold-200">
          <Icon size={22} aria-hidden />
        </div>
        <h1 className="t-title">{title} is coming next</h1>
        <p className="mx-auto mt-2 max-w-md text-ink-2">
          Dermverse is being built module by module. Billing is ready to use today; {title.toLowerCase()} will appear here
          in an upcoming update.
        </p>
        <NavLink to="/invoices/new" className="btn btn-primary mt-6">
          <FilePlus2 size={17} aria-hidden /> Create an invoice
        </NavLink>
      </div>
    </div>
  );
}
