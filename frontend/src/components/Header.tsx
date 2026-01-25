import { useApp } from '@/contexts/AppContext';
import { StatusBadge } from './StatusBadge';
import { LogOut, ChevronDown, Headphones } from 'lucide-react';
import { AgentStatus } from '@/types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import logoWhite from '@/assets/logo-white.png';

export function Header() {
  const { state, setAgentStatus, logout } = useApp();
  const { user, agentStatus } = state;

  const statusOptions: { value: AgentStatus; label: string }[] = [
    { value: 'available', label: 'Disponivel' },
    { value: 'busy', label: 'Ocupado' },
    { value: 'offline', label: 'Offline' },
  ];

  return (
    <header className="header-gradient h-16 px-6 flex items-center justify-between sticky top-0 z-50 backdrop-blur-sm">
      {/* Left side - Logo */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3">
          <img src={logoWhite} alt="Fyntra" className="h-7 w-auto" />
          <div className="h-5 w-px bg-border/50" />
          <div className="flex items-center gap-2 text-muted-foreground">
            <Headphones className="w-4 h-4" />
            <span className="text-sm font-medium">Softphone</span>
          </div>
        </div>
      </div>

      {/* Right side - Status & User */}
      <div className="flex items-center gap-3">
        {/* Status Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/30 hover:bg-muted/50 border border-border/30 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/20">
            <StatusBadge status={agentStatus} size="sm" />
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44 bg-card/95 backdrop-blur-md border-border/50">
            {statusOptions.map((option) => (
              <DropdownMenuItem
                key={option.value}
                onClick={() => setAgentStatus(option.value)}
                className="flex items-center gap-3 cursor-pointer"
              >
                <StatusBadge status={option.value} size="sm" showLabel={false} />
                <span className="text-sm">{option.label}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="h-8 w-px bg-border/30" />

        {/* User Info */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
              <span className="text-sm font-semibold text-primary">
                {user?.name?.charAt(0).toUpperCase() || 'U'}
              </span>
            </div>
            <div className="hidden sm:block text-right">
              <p className="font-medium text-sm leading-tight">{user?.name}</p>
              <p className="text-xs text-muted-foreground leading-tight">{user?.email}</p>
            </div>
          </div>

          <button
            onClick={logout}
            className="p-2 rounded-lg hover:bg-destructive/10 border border-transparent hover:border-destructive/20 transition-all duration-200 group"
            title="Sair"
          >
            <LogOut className="w-4 h-4 text-muted-foreground group-hover:text-destructive transition-colors" />
          </button>
        </div>
      </div>
    </header>
  );
}
