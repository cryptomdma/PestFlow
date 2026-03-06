import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  Bell,
  UserCircle2,
  DollarSign,
  CheckCircle2,
  Percent,
  Users,
  Clock3,
  Gauge,
  AlertTriangle,
} from "lucide-react";

type Period = "today" | "week" | "month";

const topNavItems = ["Dashboard", "Operations", "Financials", "Team"];

const kpiCards = [
  {
    title: "Revenue",
    value: "$48,320",
    helper: "Compared to last period",
    trend: "+12.4%",
    icon: DollarSign,
    iconWrap: "bg-green-100",
    iconColor: "text-green-600",
    trendColor: "text-green-600",
  },
  {
    title: "Jobs Completed",
    value: "342 / 380",
    helper: "90% completion progress",
    progress: 90,
    icon: CheckCircle2,
    iconWrap: "bg-blue-100",
    iconColor: "text-blue-600",
  },
  {
    title: "Completion Rate",
    value: "89.8%",
    helper: "Target: 92%",
    trend: "+1.3%",
    icon: Percent,
    iconWrap: "bg-purple-100",
    iconColor: "text-purple-600",
    trendColor: "text-purple-600",
  },
  {
    title: "Active Technicians",
    value: "24",
    helper: "92% utilization",
    trend: "3 on standby",
    icon: Users,
    iconWrap: "bg-amber-100",
    iconColor: "text-amber-600",
    trendColor: "text-amber-600",
  },
] as const;

const performers = [
  { name: "Elena R.", jobs: 18, score: "98%", rank: 1 },
  { name: "Marcus T.", jobs: 16, score: "95%", rank: 2 },
  { name: "Sophia L.", jobs: 15, score: "94%", rank: 3 },
];

const activities = [
  {
    icon: CheckCircle2,
    iconWrap: "bg-green-100",
    iconColor: "text-green-600",
    title: "Service complete: 125 Oak Street",
    detail: "Technician: Marcus T. • 1 hour ago",
    rightLabel: "Completed",
    rightColor: "text-green-600",
  },
  {
    icon: DollarSign,
    iconWrap: "bg-blue-100",
    iconColor: "text-blue-600",
    title: "Invoice paid: INV-2094",
    detail: "Recurring quarterly service",
    rightLabel: "$280",
    rightColor: "text-gray-900",
  },
  {
    icon: AlertTriangle,
    iconWrap: "bg-amber-100",
    iconColor: "text-amber-600",
    title: "Route delay reported",
    detail: "Highway closure near North Loop",
    rightLabel: "Action",
    rightColor: "text-blue-600",
  },
] as const;

export default function DesktopDashboard() {
  const [selectedPeriod, setSelectedPeriod] = useState<Period>("today");

  const periodSubtitle = useMemo(() => {
    if (selectedPeriod === "today") return "Today, March 5, 2026";
    if (selectedPeriod === "week") return "Week of March 2 - March 8, 2026";
    return "March 2026";
  }, [selectedPeriod]);

  return (
    <div className="w-full h-screen bg-gray-50 flex flex-col">
      <nav className="bg-white border-b border-gray-200 px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-8">
            <div className="text-xl font-bold text-blue-600">PestFlow</div>
            <div className="hidden md:flex items-center gap-6">
              {topNavItems.map((item, index) => (
                <button
                  key={item}
                  type="button"
                  className={
                    index === 0
                      ? "text-blue-600 font-medium border-b-2 border-blue-600 pb-1"
                      : "text-gray-600 hover:text-gray-900 pb-1"
                  }
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button type="button" className="relative p-2 hover:bg-gray-100 rounded-lg">
              <Bell className="h-5 w-5 text-gray-600" />
              <span className="absolute top-1 right-1 h-2 w-2 bg-red-500 rounded-full" />
            </button>
            <button type="button" className="p-2 hover:bg-gray-100 rounded-lg">
              <UserCircle2 className="h-5 w-5 text-gray-600" />
            </button>
            <Link href="/mobile-dashboard" className="hidden md:inline-flex px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:text-gray-900 hover:bg-gray-50">
              Mobile View
            </Link>
          </div>
        </div>
      </nav>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto p-6 space-y-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
              <p className="text-gray-600 mt-1">{periodSubtitle}</p>
            </div>

            <div className="bg-white border border-gray-200 p-1 rounded-lg flex items-center gap-1">
              <button
                type="button"
                onClick={() => setSelectedPeriod("today")}
                className={
                  selectedPeriod === "today"
                    ? "px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white"
                    : "px-3 py-1.5 text-sm rounded-md text-gray-600 hover:text-gray-900"
                }
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setSelectedPeriod("week")}
                className={
                  selectedPeriod === "week"
                    ? "px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white"
                    : "px-3 py-1.5 text-sm rounded-md text-gray-600 hover:text-gray-900"
                }
              >
                This Week
              </button>
              <button
                type="button"
                onClick={() => setSelectedPeriod("month")}
                className={
                  selectedPeriod === "month"
                    ? "px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white"
                    : "px-3 py-1.5 text-sm rounded-md text-gray-600 hover:text-gray-900"
                }
              >
                This Month
              </button>
            </div>
          </div>

          <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {kpiCards.map((card) => {
              const Icon = card.icon;
              return (
                <article key={card.title} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className={`p-3 rounded-lg ${card.iconWrap}`}>
                      <Icon className={`h-6 w-6 ${card.iconColor}`} />
                    </div>
                    {card.trend ? (
                      <span className={`text-xs font-semibold ${card.trendColor ?? "text-gray-600"}`}>
                        {card.trend}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-500">&nbsp;</span>
                    )}
                  </div>
                  <p className="text-sm font-medium text-gray-600">{card.title}</p>
                  <p className="text-3xl font-bold text-gray-900 mt-2">{card.value}</p>
                  {card.progress ? (
                    <div className="mt-3">
                      <div className="bg-gray-200 rounded-full h-2">
                        <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${card.progress}%` }} />
                      </div>
                      <p className="text-xs text-gray-500 mt-2">{card.helper}</p>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500 mt-3">{card.helper}</p>
                  )}
                </article>
              );
            })}
          </section>

          <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <article className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-gray-700 font-semibold">Labor Cost</h3>
                <Clock3 className="h-5 w-5 text-gray-400" />
              </div>
              <div className="mt-4 space-y-3 text-sm text-gray-600">
                <div className="flex justify-between">
                  <span>Total Hours</span>
                  <span className="text-gray-900 font-medium">496h</span>
                </div>
                <div className="flex justify-between">
                  <span>Total Cost</span>
                  <span className="text-gray-900 font-medium">$16,880</span>
                </div>
                <div className="pt-3 border-t border-gray-200 flex justify-between">
                  <span>Cost per Job</span>
                  <span className="text-blue-600 font-semibold">$49.35</span>
                </div>
              </div>
            </article>

            <article className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-gray-700 font-semibold">Revenue Breakdown</h3>
                <DollarSign className="h-5 w-5 text-gray-400" />
              </div>
              <div className="mt-4 space-y-3 text-sm text-gray-600">
                <div className="flex justify-between">
                  <span>Recurring</span>
                  <span className="text-gray-900 font-medium">$31,200</span>
                </div>
                <div className="flex justify-between">
                  <span>One-time</span>
                  <span className="text-gray-900 font-medium">$12,470</span>
                </div>
                <div className="pt-3 border-t border-gray-200 flex justify-between">
                  <span>Add-ons</span>
                  <span className="text-gray-900 font-semibold">$4,650</span>
                </div>
              </div>
            </article>

            <article className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-gray-700 font-semibold">Efficiency</h3>
                <Gauge className="h-5 w-5 text-gray-400" />
              </div>
              <div className="mt-4 space-y-3 text-sm text-gray-600">
                <div className="flex justify-between">
                  <span>Avg Duration</span>
                  <span className="text-gray-900 font-medium">54 min</span>
                </div>
                <div className="flex justify-between">
                  <span>Jobs per Tech / Day</span>
                  <span className="text-gray-900 font-medium">8.2</span>
                </div>
                <div className="pt-3 border-t border-gray-200 flex justify-between">
                  <span>Route Efficiency</span>
                  <span className="text-green-600 font-semibold">94%</span>
                </div>
              </div>
            </article>
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <article className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-gray-900 font-semibold">Top Performers</h3>
                <button type="button" className="text-sm text-blue-600 hover:text-blue-700">View All</button>
              </div>
              <div className="space-y-3">
                {performers.map((person) => (
                  <div
                    key={person.name}
                    className={
                      person.rank === 1
                        ? "rounded-lg border border-green-200 bg-green-50 p-3 flex items-center justify-between"
                        : "rounded-lg border border-gray-200 p-3 flex items-center justify-between hover:bg-gray-50"
                    }
                  >
                    <div>
                      <p className="text-sm font-semibold text-gray-900">#{person.rank} {person.name}</p>
                      <p className="text-xs text-gray-500 mt-1">{person.jobs} jobs completed</p>
                    </div>
                    <span className={person.rank === 1 ? "text-green-600 text-sm font-semibold" : "text-gray-700 text-sm font-semibold"}>
                      {person.score}
                    </span>
                  </div>
                ))}
              </div>
            </article>

            <article className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
              <h3 className="text-gray-900 font-semibold mb-4">Today's Schedule Overview</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                  <p className="text-xs text-green-700">Completed</p>
                  <p className="text-2xl font-bold text-green-600 mt-1">38</p>
                </div>
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                  <p className="text-xs text-blue-700">In Progress</p>
                  <p className="text-2xl font-bold text-blue-600 mt-1">6</p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <p className="text-xs text-gray-600">Scheduled</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">14</p>
                </div>
                <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                  <p className="text-xs text-red-700">Issues / Delays</p>
                  <p className="text-2xl font-bold text-red-600 mt-1">2</p>
                </div>
              </div>
            </article>
          </section>

          <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-gray-900 font-semibold">Recent Activity</h3>
              <button type="button" className="text-sm text-blue-600 hover:text-blue-700">View All</button>
            </div>
            <div className="space-y-2">
              {activities.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.title} className="rounded-lg p-3 flex items-center justify-between gap-4 hover:bg-gray-50">
                    <div className="min-w-0 flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${item.iconWrap}`}>
                        <Icon className={`h-4 w-4 ${item.iconColor}`} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{item.title}</p>
                        <p className="text-xs text-gray-500 truncate">{item.detail}</p>
                      </div>
                    </div>
                    <div className={`text-sm font-semibold ${item.rightColor}`}>{item.rightLabel}</div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

