import { useMemo } from 'react';
import { Card, CardContent } from './ui/card';
import { Phone, PhoneIncoming, TrendingUp, Clock } from 'lucide-react';
import { CallRecord } from '@/types';

interface MetricsDashboardProps {
  calls: CallRecord[];
  isLoading?: boolean;
}

export function MetricsDashboard({ calls, isLoading }: MetricsDashboardProps) {
  const metrics = useMemo(() => {
    // Filter calls from today
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

    // Average duration of answered calls
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
      color: 'text-primary',
      bgColor: 'bg-primary/10',
    },
    {
      title: 'Atendidas',
      value: metrics.answeredToday,
      icon: PhoneIncoming,
      color: 'text-success',
      bgColor: 'bg-success/10',
    },
    {
      title: 'Taxa Atendimento',
      value: `${metrics.answerRate}%`,
      icon: TrendingUp,
      color: metrics.answerRate >= 50 ? 'text-success' : metrics.answerRate >= 30 ? 'text-yellow-500' : 'text-destructive',
      bgColor: metrics.answerRate >= 50 ? 'bg-success/10' : metrics.answerRate >= 30 ? 'bg-yellow-500/10' : 'bg-destructive/10',
    },
    {
      title: 'Duração Média',
      value: formatDuration(metrics.avgDuration),
      icon: Clock,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
    },
  ];

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="glass-card">
            <CardContent className="p-4">
              <div className="animate-pulse">
                <div className="h-4 bg-muted rounded w-24 mb-2"></div>
                <div className="h-8 bg-muted rounded w-16"></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {metricCards.map((metric) => {
        const Icon = metric.icon;
        return (
          <Card key={metric.title} className="glass-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">{metric.title}</p>
                  <p className="text-2xl font-bold">{metric.value}</p>
                </div>
                <div className={`w-10 h-10 rounded-full ${metric.bgColor} flex items-center justify-center`}>
                  <Icon className={`w-5 h-5 ${metric.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
