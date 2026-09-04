import { useState, type ReactNode } from "react";
import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  ChevronRight,
  LayoutDashboard,
  LogOut,
  Menu,
  Mic,
  Moon,
  MapPin,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  Users,
  FileText,
  PieChart,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Logo } from "@/components/Logo";
import { useTheme } from "@/hooks/use-theme";
import { useAuth, useSignOut } from "@/hooks/use-auth";
import { ROLE_LABEL } from "@/lib/validators";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/services/repository";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/customers", label: "Customers", icon: Users },
  { to: "/leads", label: "Leads", icon: FileText },
  { to: "/vehicles", label: "Vehicles", icon: MapPin },
  { to: "/inventory", label: "Inventory", icon: ShieldCheck },
  { to: "/quotations", label: "Quotations", icon: FileText },
  { to: "/finance", label: "Finance/EMI", icon: FileText },
  { to: "/test-rides", label: "Test Rides", icon: MapPin },
  { to: "/follow-ups", label: "Follow-ups", icon: Bell },
  { to: "/reports", label: "Reports", icon: PieChart },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

function NavLinks({ onNavigate }: { onNavigate?: (() => void) | undefined }) {
  return (
    <nav className="flex flex-col gap-1 p-3" aria-label="Sidebar">
      {nav.map(({ to, label, icon: Icon, ...rest }) => (
        <Link
          key={to}
          to={to}
          onClick={onNavigate}
          activeOptions={{ exact: "exact" in rest ? rest.exact : false }}
          className="group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[status=active]:bg-primary/10 data-[status=active]:text-primary"
        >
          <Icon className="size-4.5 shrink-0" />
          <span className="truncate">{label}</span>
        </Link>
      ))}
    </nav>
  );
}

function SidebarBody({ onNavigate }: { onNavigate?: (() => void) | undefined }) {
  const signOut = useSignOut();
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center border-b border-sidebar-border px-5">
        <Logo />
      </div>
      <div className="flex-1 overflow-y-auto">
        <NavLinks onNavigate={onNavigate} />
      </div>
      <div className="p-3">
        <div className="glass-card rounded-2xl p-4">
          <p className="text-xs font-semibold">AI credits</p>
          <p className="mt-1 text-xs text-muted-foreground">1,240 of 2,000 voice minutes used</p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full w-[62%] rounded-full bg-primary" />
          </div>
        </div>
        <button
          onClick={() => void signOut()}
          className="mt-3 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <LogOut className="size-4.5" /> Logout
        </button>
      </div>
    </div>
  );
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return new Date(iso).toLocaleDateString("en-IN");
}

export function AppShell() {
  const { dark, toggle } = useTheme();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile, roles } = useAuth();
  const signOut = useSignOut();
  const [search, setSearch] = useState("");
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const crumb = nav.find((n) => n.to === pathname)?.label ?? "Dashboard";

  const notificationsQuery = useQuery({
    queryKey: ["notifications"],
    queryFn: listNotifications,
    refetchInterval: 60_000,
  });
  const notifications = notificationsQuery.data ?? [];
  const unread = notifications.filter((n) => !n.is_read).length;

  const readMutation = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const readAllMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const name = profile?.name ?? "Sales team";
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const roleLabel = roles[0] ? ROLE_LABEL[roles[0]] : "Team member";

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-sidebar-border bg-sidebar lg:block">
        <SidebarBody />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-xl">
          <div className="grid h-16 grid-cols-[auto_1fr_auto] items-center gap-3 px-4 sm:px-6">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="lg:hidden" aria-label="Open navigation">
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0">
                <SidebarBody />
              </SheetContent>
            </Sheet>

            <form
              className="relative hidden min-w-0 max-w-md lg:block"
              onSubmit={(event) => {
                event.preventDefault();
                if (!search.trim()) return;
                navigate({ to: "/quotations", search: { q: search.trim() } });
              }}
            >
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search quotations, customers…"
                className="rounded-full pl-9"
              />
            </form>
            <div className="lg:hidden" />

            <div className="flex items-center gap-1.5">
              <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle dark mode">
                {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
                    <Bell className="size-5" />
                    {unread > 0 && (
                      <span className="absolute right-2 top-2 size-2 rounded-full bg-destructive" />
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-72">
                  <DropdownMenuLabel className="flex items-center justify-between gap-2">
                    Notifications
                    {unread > 0 && (
                      <button
                        className="text-xs font-normal text-primary hover:underline"
                        onClick={(event) => {
                          event.preventDefault();
                          readAllMutation.mutate();
                        }}
                      >
                        Mark all read
                      </button>
                    )}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {notifications.length === 0 && (
                    <DropdownMenuItem disabled className="text-sm text-muted-foreground">
                      You're all caught up
                    </DropdownMenuItem>
                  )}
                  {notifications.slice(0, 8).map((n) => (
                    <DropdownMenuItem
                      key={n.id}
                      onSelect={() => !n.is_read && readMutation.mutate(n.id)}
                      className="flex-col items-start gap-0.5"
                    >
                      <span className={cn("text-sm", !n.is_read && "font-medium")}>{n.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {n.body ? `${n.body} · ` : ""}
                        {relativeTime(n.created_at)}
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2 rounded-full p-1 pr-2 transition-colors hover:bg-muted">
                    <Avatar className="size-8">
                      <AvatarFallback className="bg-primary/10 text-primary">
                        {initials || "VQ"}
                      </AvatarFallback>
                    </Avatar>
                    <span className="hidden text-sm font-medium sm:block">{name}</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuLabel className="flex flex-col">
                    {name}
                    <Badge variant="secondary" className="mt-1 w-fit">
                      {roleLabel}
                    </Badge>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/settings">Settings</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void signOut()}>Logout</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        <div className="flex items-center gap-1.5 px-4 pt-5 text-xs text-muted-foreground sm:px-6">
          <Link to="/dashboard" className="hover:text-primary">
            QuoteSpeak
          </Link>
          <ChevronRight className="size-3" />
          <span className="text-foreground">{crumb}</span>
        </div>

        <main className="flex-1 px-4 pb-12 pt-4 sm:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className={cn("mb-6 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4")}>
      <div className="min-w-0">
        <h1 className="truncate text-2xl font-semibold sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions}
    </div>
  );
}
