import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Check, LogOut, Plus } from 'lucide-react';
import type { Workspace } from '@/shared/types';
import { useAuth } from '@/auth/AuthProvider';
import { FullSkeleton } from '@/auth/guards';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

// P1 is adding `workspace` + `onUnauthorized` to <Office>. Until that lands the props are ignored;
// this local type lets us pass them now without touching web/src/office/**.
type LiveOfficeProps = { mode: 'live'; workspace: Workspace; onUnauthorized: () => void };
const Office = lazy(() => import('@/office/Office')) as unknown as LazyExoticComponent<ComponentType<LiveOfficeProps>>;

/** /app and /app/:ws: the live office, full screen, for one of the user's ready workspaces. */
export default function AppShell() {
  const { user, workspaces, expire } = useAuth();
  const { ws: wsId } = useParams();
  const nav = useNavigate();
  const ready = workspaces.filter((w) => w.status === 'ready');
  if (!ready.length) return <Navigate to="/connect" replace />;
  const ws = wsId ? ready.find((w) => w.id === wsId) : ready[0];
  if (!ws) return <Navigate to="/app" replace />;

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#F1F1F4]">
      <Suspense fallback={<FullSkeleton />}>
        <Office key={ws.id} mode="live" workspace={ws} onUnauthorized={() => { expire(); nav('/login', { replace: true, state: { from: `/app/${ws.id}` } }); }} />
      </Suspense>
      {user && <AccountMenu name={user.name} email={user.email} current={ws} all={ready} />}
    </div>
  );
}

const initials = (s: string) => s.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?';

/**
 * Small floating account button. Bottom-left: the office HUD owns the top bar (brand left, controls right)
 * and the chat panel docks right; bottom-left stays free unless the topics drawer is open.
 */
function AccountMenu({ name, email, current, all }: { name: string; email: string; current: Workspace; all: Workspace[] }) {
  const nav = useNavigate();
  const { logout } = useAuth();
  return (
    <div className="pointer-events-none fixed bottom-3 left-3 z-[60] md:bottom-4 md:left-4">
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Account: ${name}`}
          className="pointer-events-auto grid size-10 place-items-center rounded-full border border-black/10 bg-neutral-900 text-[13px] font-semibold tracking-wide text-white shadow-[0_6px_20px_-6px_rgba(0,0,0,0.45)] ring-2 ring-white/90 transition-transform outline-none hover:scale-105 focus-visible:ring-saffron data-popup-open:scale-105"
        >
          {initials(name)}
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" sideOffset={10} className="w-64 rounded-xl p-1.5">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="px-2 py-1.5">
              <span className="block truncate text-[13.5px] font-medium text-foreground">{name}</span>
              <span className="block truncate text-[12px] font-normal text-neutral-500">{email}</span>
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel className="px-2 pt-1.5 pb-1 text-[11px] font-medium text-neutral-400">Workspaces</DropdownMenuLabel>
            {all.map((w) => (
              <DropdownMenuItem key={w.id} onClick={() => w.id !== current.id && nav(`/app/${w.id}`)} className="gap-2.5 rounded-lg px-2 py-1.5">
                <span className="grid size-6 shrink-0 place-items-center rounded-md bg-gradient-to-br from-[#FFB830] to-[#F08A00] text-[11px] font-semibold text-white">{w.name[0]?.toUpperCase()}</span>
                <span className="min-w-0 flex-1 truncate text-[13.5px]">{w.name}</span>
                <Check className={cn('size-4', w.id === current.id ? 'opacity-100' : 'opacity-0')} />
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem onClick={() => nav('/connect')} className="gap-2.5 rounded-lg px-2 py-1.5 text-[13.5px]">
              <span className="grid size-6 place-items-center rounded-md border border-dashed border-black/20"><Plus className="size-3.5" /></span>
              Connect another group
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => void logout().then(() => nav('/login', { replace: true }))} className="gap-2.5 rounded-lg px-2 py-1.5 text-[13.5px]">
            <LogOut className="size-4" />Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
