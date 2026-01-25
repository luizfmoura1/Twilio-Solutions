import { useMemo } from 'react';
import { Phone, PhoneIncoming, TrendingUp, Clock } from 'lucide-react';
import { CallRecord } from '@/types';
import { cn } from '@/lib/utils';

interface MetricsDashboardProps {
  calls: CallRecord[];
  isLoading?: boolean;
}

export function MetricsDashboard({ calls, isLoading }: MetricsDashboardProps) {
  const metrics = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayCalls = calls.filter(call => {
      const callDate = new Date(call.timestamp);
      callDate.setHours(0, 0, 0, 0);
      return callDate.getTime() === today.getTime();
    });

    const totalToday = todayCalls.length;
    const answeredToday = todayCalls.filter(call => call.disposition === 'answered').length;
    const answerRate = totalToday > 0 ? Math.round((answeredToday / totalToday) * 100) : 0;

    const answeredCalls = todayCalls.filter(call => call.disposition === 'answered' && call.duration > 0);
    const avgDuration = answeredCalls.length > 0
      ? Math.round(answeredCalls.reduce((sum, call) => sum + call.duration, 0) / answeredCalls.length)
      : 0;

    return { totalToday, answeredToday, answerRate, avgDuration };
  }, [calls]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const metricCards = [
    {
      title: 'Chamadas Hoje',
      value: metrics.totalToday,
      icon: Phone,
      gradient: 'from-blue-500/20 to-blue-600/10',
      iconBg: 'bg-blue-500/20',
      iconColor: 'text-blue-400',
      borderColor: 'border-blue-500/20',
    },
    {
      title: 'Atendidas',
      value: metrics.answeredToday,
      icon: PhoneIncoming,
      gradient: 'from-emerald-500/20 to-emerald-600/10',
      iconBg: 'bg-emerald-500/20',
      iconColor: 'text-emerald-400',
      borderColor: 'border-emerald-500/20',
    },
    {
      title: 'Taxa Atendimento',
      value: `${metrics.answerRate}%`,
      icon: TrendingUp,
      gradient: metrics.answerRate >= 50
        ? 'from-emerald-500/20 to-emerald-600/10'
        : metrics.answerRate >= 30
        ? 'from-amber-500/20 to-amber-600/10'
        : 'from-red-500/20 to-red-600/10',
      iconBg: metrics.answerRate >= 50
        ? 'bg-emerald-500/20'
        : metrics.answerRate >= 30
        ? 'bg-amber-500/20'
        : 'bg-red-500/20',
      iconColor: metrics.answerRate >= 50
        ? 'text-emerald-400'
        : metrics.answerRate >= 30
        ? 'text-amber-400'
        : 'text-red-400',
      borderColor: metrics.answerRate >= 50
        ? 'border-emerald-500/20'
        : metrics.answerRate >= 30
        ? 'border-amber-500/20'
        : 'border-red-500/20',
    },
    {
      title: 'Duracao Media',
      value: formatDuration(metrics.avgDuration),
      icon: Clock,
      gradient: 'from-violet-500/20 to-violet-600/10',
      iconBg: 'bg-violet-500/20',
      iconColor: 'text-violet-400',
      borderColor: 'border-violet-500/20',
    },
  ];

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="modern-card p-4">
            <div className="animate-pulse space-y-3">
              <div className="flex items-center justify-between">
                <div className="h-3 bg-muted rounded w-20"></div>
                <div className="w-9 h-9 bg-muted rounded-lg"></div>
              </div>
              <div className="h-7 bg-muted rounded w-16"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {metricCards.map((metric, index) => {
        const Icon = metric.icon;
        return (
          <div
            key={metric.title}
            className={cn(
              'modern-card relative overflow-hidden p-4 transition-all duration-300 hover:scale-[1.02]',
              'border-l-2',
              metric.borderColor
            )}
            style={{ animationDelay: `${index * 50}ms` }}
          >
            {/* Background gradient */}
            <div className={cn(
              'absolute inset-0 bg-gradient-to-br opacity-50',
              metric.gradient
            )} />

            {/* Content */}
            <div className="relative z-10">
              <div className="flex items-start justify-between mb-3">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {metric.title}
                </span>
                <div className={cn(
                  'w-9 h-9 rounded-lg flex items-center justify-center',
                  metric.iconBg
                )}>
                  <Icon className={cn('w-4.5 h-4.5', metric.iconColor)} />
                </div>
              </div>
              <p className="text-2xl font-bold tracking-tight">{metric.value}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
