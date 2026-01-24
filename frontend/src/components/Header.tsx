import { useApp } from '@/contexts/AppContext';
import { StatusBadge } from './StatusBadge';
import { LogOut, ChevronDown } from 'lucide-react';
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
    { value: 'available', label: 'Disponível' },
    { value: 'busy', label: 'Ocupado' },
    { value: 'offline', label: 'Offline' },
  ];

  return (
    <header className="h-16 bg-card border-b border-border px-6 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <img src={logoWhite} alt="Fyntra" className="h-8 w-auto" />
        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
          Softphone
        </span>
      </div>

      <div className="flex items-center gap-4">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-muted transition-colors">
            <StatusBadge status={agentStatus} size="sm" />
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            {statusOptions.map((option) => (
              <DropdownMenuItem
                key={option.value}
                onClick={() => setAgentStatus(option.value)}
                className="flex items-center gap-2"
              >
                <StatusBadge status={option.value} size="sm" showLabel={false} />
                <span>{option.label}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex items-center gap-3 pl-4 border-l border-border">
          <div className="text-right">
            <p className="font-medium text-sm">{user?.name}</p>
            <p className="text-xs text-muted-foreground">{user?.email}</p>
          </div>

          <button
            onClick={logout}
            className="p-2 hover:bg-destructive/20 rounded-lg transition-colors group"
            title="Sair"
          >
            <LogOut className="w-5 h-5 text-muted-foreground group-hover:text-destructive" />
          </button>
        </div>
      </div>
    </header>
  );
}
