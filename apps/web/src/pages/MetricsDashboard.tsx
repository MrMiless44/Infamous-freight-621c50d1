import React, { useEffect, useState } from 'react';
import {
  Users,
  Truck,
  DollarSign,
  Activity,
  Clock,
  Target,
  BarChart3,
  Map,
  Award,
  Zap,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import api from '@/api-client/client';

interface WeeklyMetric {
  label: string;
  current: number;
  previous: number;
  change: number;
  target: number;
  unit: string;
  icon: React.ReactNode;
  color: string;
}

interface TopLane {
  origin: string;
  destination: string;
  loads: number;
  avgRate: number;
  change: number;
}

interface DriverLeader {
  name: string;
  loads: number;
  onTime: number;
  revenue: number;
  xp: number;
}

type DateRange = '7d' | '30d' | '90d';
type ApiList<T> = { data?: T[]; count?: number };

type LoadRecord = {
  id: string;
  driverId?: string | null;
  originCity?: string;
  originState?: string;
  destCity?: string;
  destState?: string;
  rate?: number | string | null;
  distance?: number | string | null;
  ratePerMile?: number | string | null;
  status?: string;
  pickupDate?: string;
  createdAt?: string;
};

type DriverRecord = { id: string; name?: string; status?: string };
type OperationRecord = {
  id: string;
  status?: string;
  dispatchedAt?: string;
  confirmedAt?: string;
  createdAt?: string;
  pickupDate?: string;
  onTimeDelivery?: number | string | null;
};

type DashboardData = {
  metrics: WeeklyMetric[];
  topLanes: TopLane[];
  driverLeaders: DriverLeader[];
  isSample: boolean;
};

const RANGE_DAYS: Record<DateRange, number> = { '7d': 7, '30d': 30, '90d': 90 };

const sampleData: DashboardData = {
  isSample: true,
  metrics: [
    { label: 'Total Loads', current: 47, previous: 38, change: 23.7, target: 50, unit: 'loads', icon: <Truck size={20} />, color: 'text-blue-400' },
    { label: 'Revenue', current: 28400, previous: 22100, change: 28.5, target: 30000, unit: '$', icon: <DollarSign size={20} />, color: 'text-green-400' },
    { label: 'Active Drivers', current: 12, previous: 12, change: 0, target: 15, unit: 'drivers', icon: <Users size={20} />, color: 'text-purple-400' },
    { label: 'Avg Rate/Mile', current: 2.84, previous: 2.71, change: 4.8, target: 3, unit: '$/mi', icon: <Activity size={20} />, color: 'text-orange-400' },
    { label: 'Dispatch Time', current: 4.2, previous: 6.8, change: -38.2, target: 3, unit: 'min', icon: <Clock size={20} />, color: 'text-cyan-400' },
    { label: 'On-Time %', current: 94, previous: 89, change: 5.6, target: 95, unit: '%', icon: <Target size={20} />, color: 'text-emerald-400' },
  ],
  topLanes: [
    { origin: 'Chicago, IL', destination: 'Dallas, TX', loads: 8, avgRate: 2.91, change: 5.2 },
    { origin: 'Atlanta, GA', destination: 'Charlotte, NC', loads: 6, avgRate: 2.74, change: -2.1 },
    { origin: 'Houston, TX', destination: 'Phoenix, AZ', loads: 5, avgRate: 3.12, change: 8.4 },
    { origin: 'Memphis, TN', destination: 'Indianapolis, IN', loads: 4, avgRate: 2.68, change: 1.3 },
    { origin: 'Denver, CO', destination: 'Kansas City, MO', loads: 4, avgRate: 2.55, change: -4.5 },
  ],
  driverLeaders: [
    { name: 'Marcus T.', loads: 9, onTime: 100, revenue: 5800, xp: 2450 },
    { name: 'James R.', loads: 8, onTime: 95, revenue: 5200, xp: 2180 },
    { name: 'David K.', loads: 7, onTime: 93, revenue: 4700, xp: 1950 },
    { name: 'Carlos M.', loads: 7, onTime: 100, revenue: 4900, xp: 2100 },
    { name: 'Robert L.', loads: 6, onTime: 88, revenue: 3800, xp: 1620 },
  ],
};

function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getDate(record: { pickupDate?: string; createdAt?: string }): Date | null {
  const value = record.pickupDate ?? record.createdAt;
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getBounds(range: DateRange) {
  const now = new Date();
  const currentStart = new Date(now);
  currentStart.setDate(now.getDate() - RANGE_DAYS[range]);
  const previousStart = new Date(currentStart);
  previousStart.setDate(currentStart.getDate() - RANGE_DAYS[range]);
  return { now, currentStart, previousStart };
}

function inRange(date: Date | null, start: Date, end: Date) {
  return Boolean(date && date >= start && date <= end);
}

function change(current: number, previous: number): number {
  if (!previous) return current ? 100 : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function revenue(loads: LoadRecord[]) {
  return loads.reduce((total, load) => total + asNumber(load.rate), 0);
}

function ratePerMile(loads: LoadRecord[]) {
  const totalRevenue = revenue(loads);
  const totalDistance = loads.reduce((total, load) => total + asNumber(load.distance), 0);
  if (totalRevenue && totalDistance) return Math.round((totalRevenue / totalDistance) * 100) / 100;

  const rates = loads.map((load) => asNumber(load.ratePerMile)).filter(Boolean);
  if (!rates.length) return 0;
  return Math.round((rates.reduce((total, rate) => total + rate, 0) / rates.length) * 100) / 100;
}

function dispatchMinutes(dispatches: OperationRecord[]) {
  const durations = dispatches
    .map((dispatch) => {
      if (!dispatch.dispatchedAt || !dispatch.confirmedAt) return null;
      const start = new Date(dispatch.dispatchedAt).getTime();
      const end = new Date(dispatch.confirmedAt).getTime();
      return Number.isFinite(start) && Number.isFinite(end) && end >= start ? (end - start) / 60000 : null;
    })
    .filter((value): value is number => typeof value === 'number');

  if (!durations.length) return 0;
  return Math.round((durations.reduce((total, duration) => total + duration, 0) / durations.length) * 10) / 10;
}

function onTimePercent(loads: LoadRecord[], operations: OperationRecord[]) {
  const metricValues = operations.map((item) => asNumber(item.onTimeDelivery, NaN)).filter(Number.isFinite);
  if (metricValues.length) return Math.round(metricValues.reduce((total, item) => total + item, 0) / metricValues.length);

  const deliveredLoads = loads.filter((load) => String(load.status ?? '').toLowerCase().includes('deliver'));
  return deliveredLoads.length ? 100 : 0;
}

function topLanes(loads: LoadRecord[]): TopLane[] {
  const groups = new Map<string, { origin: string; destination: string; loads: LoadRecord[] }>();

  for (const load of loads) {
    const origin = [load.originCity, load.originState].filter(Boolean).join(', ') || 'Unknown origin';
    const destination = [load.destCity, load.destState].filter(Boolean).join(', ') || 'Unknown destination';
    const key = `${origin}|${destination}`;
    const lane = groups.get(key) ?? { origin, destination, loads: [] };
    lane.loads.push(load);
    groups.set(key, lane);
  }

  return Array.from(groups.values())
    .map((lane) => ({ origin: lane.origin, destination: lane.destination, loads: lane.loads.length, avgRate: ratePerMile(lane.loads), change: 0 }))
    .sort((a, b) => b.loads - a.loads || b.avgRate - a.avgRate)
    .slice(0, 5);
}

function driverLeaders(loads: LoadRecord[], drivers: DriverRecord[]): DriverLeader[] {
  const driversById = new Map(drivers.map((driver) => [driver.id, driver]));
  const groups = new Map<string, LoadRecord[]>();

  for (const load of loads) {
    if (!load.driverId) continue;
    groups.set(load.driverId, [...(groups.get(load.driverId) ?? []), load]);
  }

  const leaders = Array.from(groups.entries()).map(([driverId, driverLoads]) => {
    const driverRevenue = revenue(driverLoads);
    return {
      name: driversById.get(driverId)?.name ?? `Driver ${driverId.slice(0, 6)}`,
      loads: driverLoads.length,
      onTime: driverLoads.some((load) => String(load.status ?? '').toLowerCase().includes('deliver')) ? 100 : 0,
      revenue: driverRevenue,
      xp: Math.round(driverLoads.length * 150 + driverRevenue / 4),
    };
  });

  if (leaders.length) return leaders.sort((a, b) => b.loads - a.loads || b.revenue - a.revenue).slice(0, 5);

  return drivers
    .filter((driver) => String(driver.status ?? 'active').toLowerCase() !== 'inactive')
    .slice(0, 5)
    .map((driver) => ({ name: driver.name ?? `Driver ${driver.id.slice(0, 6)}`, loads: 0, onTime: 0, revenue: 0, xp: 0 }));
}

function buildDashboard(range: DateRange, loads: LoadRecord[], drivers: DriverRecord[], dispatches: OperationRecord[], operations: OperationRecord[]): DashboardData {
  const { now, currentStart, previousStart } = getBounds(range);
  const currentLoads = loads.filter((load) => inRange(getDate(load), currentStart, now));
  const previousLoads = loads.filter((load) => inRange(getDate(load), previousStart, currentStart));
  const currentDispatches = dispatches.filter((dispatch) => inRange(getDate(dispatch), currentStart, now));
  const previousDispatches = dispatches.filter((dispatch) => inRange(getDate(dispatch), previousStart, currentStart));
  const currentOperations = operations.filter((operation) => inRange(getDate(operation), currentStart, now));
  const previousOperations = operations.filter((operation) => inRange(getDate(operation), previousStart, currentStart));
  const currentRevenue = revenue(currentLoads);
  const previousRevenue = revenue(previousLoads);
  const currentRatePerMile = ratePerMile(currentLoads);
  const previousRatePerMile = ratePerMile(previousLoads);
  const currentDispatchMinutes = dispatchMinutes(currentDispatches);
  const previousDispatchMinutes = dispatchMinutes(previousDispatches);
  const currentOnTime = onTimePercent(currentLoads, currentOperations);
  const previousOnTime = onTimePercent(previousLoads, previousOperations);
  const activeDrivers = drivers.filter((driver) => String(driver.status ?? 'active').toLowerCase() !== 'inactive').length;

  return {
    isSample: false,
    metrics: [
      { label: 'Total Loads', current: currentLoads.length, previous: previousLoads.length, change: change(currentLoads.length, previousLoads.length), target: Math.max(50, currentLoads.length), unit: 'loads', icon: <Truck size={20} />, color: 'text-blue-400' },
      { label: 'Revenue', current: currentRevenue, previous: previousRevenue, change: change(currentRevenue, previousRevenue), target: Math.max(30000, currentRevenue), unit: '$', icon: <DollarSign size={20} />, color: 'text-green-400' },
      { label: 'Active Drivers', current: activeDrivers, previous: activeDrivers, change: 0, target: Math.max(15, activeDrivers), unit: 'drivers', icon: <Users size={20} />, color: 'text-purple-400' },
      { label: 'Avg Rate/Mile', current: currentRatePerMile, previous: previousRatePerMile, change: change(currentRatePerMile, previousRatePerMile), target: 3, unit: '$/mi', icon: <Activity size={20} />, color: 'text-orange-400' },
      { label: 'Dispatch Time', current: currentDispatchMinutes, previous: previousDispatchMinutes, change: change(currentDispatchMinutes, previousDispatchMinutes), target: 3, unit: 'min', icon: <Clock size={20} />, color: 'text-cyan-400' },
      { label: 'On-Time %', current: currentOnTime, previous: previousOnTime, change: change(currentOnTime, previousOnTime), target: 95, unit: '%', icon: <Target size={20} />, color: 'text-emerald-400' },
    ],
    topLanes: topLanes(currentLoads),
    driverLeaders: driverLeaders(currentLoads, drivers),
  };
}

function liveHeaders() {
  const tenantId = localStorage.getItem('infamous_tenant_id') ?? import.meta.env.VITE_TENANT_ID;
  const userRole = localStorage.getItem('infamous_user_role') ?? import.meta.env.VITE_USER_ROLE;
  const subscriptionStatus = localStorage.getItem('infamous_subscription_status') ?? import.meta.env.VITE_SUBSCRIPTION_STATUS;

  if (!tenantId || !userRole || !subscriptionStatus) {
    throw new Error('Live dashboard requires configured tenant, role, and subscription context.');
  }

  return { 'x-tenant-id': tenantId, 'x-user-role': userRole, 'x-subscription-status': subscriptionStatus };
}

async function fetchDashboard(range: DateRange): Promise<DashboardData> {
  const headers = liveHeaders();
  const [loads, drivers, dispatches, operations] = await Promise.all([
    api.request<ApiList<LoadRecord>>('GET', '/loads', undefined, { headers }),
    api.request<ApiList<DriverRecord>>('GET', '/drivers', undefined, { headers }),
    api.request<ApiList<OperationRecord>>('GET', '/freight-operations/loadDispatches', undefined, { headers }),
    api.request<ApiList<OperationRecord>>('GET', '/freight-operations/operationalMetrics', undefined, { headers }),
  ]);

  const dashboard = buildDashboard(range, loads.data ?? [], drivers.data ?? [], dispatches.data ?? [], operations.data ?? []);
  const hasData = dashboard.metrics.some((metric) => metric.current > 0) || dashboard.topLanes.length || dashboard.driverLeaders.length;
  return hasData || !import.meta.env.DEV ? dashboard : sampleData;
}

const MetricsDashboard: React.FC = () => {
  const [dateRange, setDateRange] = useState<DateRange>('7d');
  const [dashboard, setDashboard] = useState<DashboardData>(sampleData);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const data = await fetchDashboard(dateRange);
        if (isMounted) setDashboard(data);
      } catch (error) {
        if (!isMounted) return;
        setErrorMessage(error instanceof Error ? error.message : 'Unable to load dashboard metrics.');
        setDashboard(import.meta.env.DEV ? sampleData : { metrics: [], topLanes: [], driverLeaders: [], isSample: false });
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    void load();
    return () => { isMounted = false; };
  }, [dateRange]);

  const { metrics, topLanes, driverLeaders } = dashboard;
  const totalLoads = metrics.find((metric) => metric.label === 'Total Loads')?.current ?? 0;
  const totalRevenue = metrics.find((metric) => metric.label === 'Revenue')?.current ?? 0;
  const avgDispatchTime = metrics.find((metric) => metric.label === 'Dispatch Time')?.current ?? 0;
  const onTime = metrics.find((metric) => metric.label === 'On-Time %')?.current ?? 0;

  const getChangeIcon = (metricChange: number) => {
    if (metricChange > 0) return <ArrowUpRight size={14} className="text-green-400" />;
    if (metricChange < 0) return <ArrowDownRight size={14} className="text-red-400" />;
    return <Minus size={14} className="text-gray-400" />;
  };

  const getChangeColor = (metricChange: number, metric: string) => {
    if (metric === 'Dispatch Time') {
      if (metricChange < 0) return 'text-green-400';
      if (metricChange > 0) return 'text-red-400';
    }
    if (metricChange > 0) return 'text-green-400';
    if (metricChange < 0) return 'text-red-400';
    return 'text-gray-400';
  };

  const progressPercent = (current: number, target: number) => Math.min(100, Math.round((current / Math.max(target, 1)) * 100));

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-1">Weekly Metrics</h1>
            <p className="text-gray-400 text-sm">Track your fleet performance at a glance</p>
          </div>
          <div className="flex gap-2 bg-[#1a1a1a] rounded-lg p-1">
            {(['7d', '30d', '90d'] as const).map((range) => (
              <button
                key={range}
                onClick={() => setDateRange(range)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${dateRange === range ? 'bg-[#ff3d00] text-white' : 'text-gray-400 hover:text-white'}`}
              >
                {range === '7d' ? '7 Days' : range === '30d' ? '30 Days' : '90 Days'}
              </button>
            ))}
          </div>
        </div>

        {(isLoading || errorMessage || dashboard.isSample) && (
          <div className="mb-6 rounded-xl border border-[#333] bg-[#141414] p-4">
            <div className="flex items-center gap-3">
              {isLoading ? <RefreshCw size={18} className="animate-spin text-[#ff3d00]" /> : <AlertTriangle size={18} className={errorMessage ? 'text-red-400' : 'text-yellow-400'} />}
              <div>
                <p className="text-sm font-semibold">{isLoading ? 'Loading live fleet metrics...' : errorMessage ? 'Live metrics need attention' : 'Showing development sample data'}</p>
                <p className="text-xs text-gray-400">{isLoading ? 'Pulling loads, drivers, dispatches, and operational metrics from the API.' : errorMessage ?? 'No live tenant records were returned, so local development is using sample data.'}</p>
              </div>
            </div>
          </div>
        )}

        {metrics.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            {metrics.map((metric, i) => (
              <div key={i} className="bg-[#141414] border border-[#222] rounded-xl p-5 hover:border-[#333] transition-all">
                <div className="flex items-start justify-between mb-3">
                  <div className={`${metric.color} bg-[#1a1a1a] p-2.5 rounded-lg`}>{metric.icon}</div>
                  <div className="flex items-center gap-1">
                    {getChangeIcon(metric.change)}
                    <span className={`text-xs font-medium ${getChangeColor(metric.change, metric.label)}`}>{metric.change > 0 ? '+' : ''}{metric.change}%</span>
                  </div>
                </div>
                <div className="mb-2">
                  <p className="text-gray-400 text-sm">{metric.label}</p>
                  <p className="text-2xl font-bold">{metric.unit === '$' ? '$' : ''}{metric.current.toLocaleString()}{metric.unit !== '$' ? ` ${metric.unit}` : ''}</p>
                </div>
                <div className="mt-3">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-500">Target: {metric.unit === '$' ? '$' : ''}{metric.target.toLocaleString()}</span>
                    <span className="text-gray-500">{progressPercent(metric.current, metric.target)}%</span>
                  </div>
                  <div className="h-1.5 bg-[#222] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${progressPercent(metric.current, metric.target) >= 100 ? 'bg-green-500' : progressPercent(metric.current, metric.target) >= 75 ? 'bg-[#ff3d00]' : 'bg-yellow-500'}`}
                      style={{ width: `${progressPercent(metric.current, metric.target)}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mb-8 rounded-xl border border-[#333] bg-[#141414] p-6 text-gray-300">No live fleet metrics are available for this tenant yet.</div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-[#141414] border border-[#222] rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4"><Map size={18} className="text-[#ff3d00]" /><h2 className="text-lg font-semibold">Top Lanes</h2></div>
            <div className="space-y-3">
              {topLanes.length ? topLanes.map((lane, i) => (
                <div key={`${lane.origin}-${lane.destination}`} className="flex items-center justify-between py-2 border-b border-[#222] last:border-0">
                  <div className="flex items-center gap-3"><span className="text-sm text-gray-500 w-5">{i + 1}</span><div><p className="text-sm font-medium">{lane.origin} → {lane.destination}</p><p className="text-xs text-gray-500">{lane.loads} loads this period</p></div></div>
                  <div className="text-right"><p className="text-sm font-semibold">${lane.avgRate.toFixed(2)}/mi</p><p className={`text-xs ${lane.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>{lane.change >= 0 ? '+' : ''}{lane.change}%</p></div>
                </div>
              )) : <p className="text-sm text-gray-400">No lane data is available for this period.</p>}
            </div>
          </div>

          <div className="bg-[#141414] border border-[#222] rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4"><Award size={18} className="text-[#ff3d00]" /><h2 className="text-lg font-semibold">Driver Leaderboard</h2></div>
            <div className="space-y-3">
              {driverLeaders.length ? driverLeaders.map((driver, i) => (
                <div key={`${driver.name}-${i}`} className="flex items-center justify-between py-2 border-b border-[#222] last:border-0">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${i === 0 ? 'bg-yellow-500/20 text-yellow-400' : i === 1 ? 'bg-gray-400/20 text-gray-300' : i === 2 ? 'bg-orange-600/20 text-orange-400' : 'bg-[#222] text-gray-500'}`}>{i + 1}</div>
                    <div><p className="text-sm font-medium">{driver.name}</p><p className="text-xs text-gray-500">{driver.loads} loads • {driver.onTime}% on-time</p></div>
                  </div>
                  <div className="text-right"><p className="text-sm font-semibold">${driver.revenue.toLocaleString()}</p><div className="flex items-center gap-1 text-xs text-[#ff3d00]"><Zap size={10} /><span>{driver.xp.toLocaleString()} XP</span></div></div>
                </div>
              )) : <p className="text-sm text-gray-400">No driver leaderboard data is available for this period.</p>}
            </div>
          </div>
        </div>

        <div className="mt-6 bg-gradient-to-r from-[#ff3d00]/10 to-transparent border border-[#ff3d00]/20 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3"><BarChart3 size={18} className="text-[#ff3d00]" /><h2 className="text-lg font-semibold">Period Summary</h2></div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div><p className="text-2xl font-bold text-[#ff3d00]">{totalLoads}</p><p className="text-xs text-gray-400">Loads Dispatched</p></div>
            <div><p className="text-2xl font-bold text-green-400">${totalRevenue.toLocaleString()}</p><p className="text-xs text-gray-400">Revenue Generated</p></div>
            <div><p className="text-2xl font-bold text-cyan-400">{avgDispatchTime.toFixed(1)} min</p><p className="text-xs text-gray-400">Avg Dispatch Time</p></div>
            <div><p className="text-2xl font-bold text-emerald-400">{onTime}%</p><p className="text-xs text-gray-400">On-Time Delivery</p></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MetricsDashboard;
