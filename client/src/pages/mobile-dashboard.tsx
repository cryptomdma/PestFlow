import { Link } from "wouter";
import {
  Bell,
  CalendarDays,
  ChevronRight,
  Clock3,
  Home,
  MapPin,
  Phone,
  Route,
  Wallet,
  House,
} from "lucide-react";

const upcomingJobs = [
  { name: "Kim Residence", time: "1:00 PM", address: "92 Cedar Avenue" },
  { name: "Morgan Foods", time: "2:45 PM", address: "17 Industrial Rd" },
  { name: "Lakeside HOA", time: "4:15 PM", address: "500 Lakefront Dr" },
];

const bottomNav = [
  { label: "Home", icon: Home, active: true },
  { label: "Schedule", icon: CalendarDays, active: false },
  { label: "Route", icon: Route, active: false },
  { label: "Revenue", icon: Wallet, active: false },
] as const;

export default function MobileDashboard() {
  return (
    <div className="w-full h-screen bg-gray-50 flex flex-col max-w-md mx-auto border-x border-gray-300">
      <header className="bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-6 text-white">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-blue-100">Good morning,</p>
            <p className="text-2xl font-bold">Alex Rivera</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/" className="text-xs px-2.5 py-1.5 rounded-lg bg-white/15 hover:bg-white/20">Desktop</Link>
            <button type="button" className="relative p-2 rounded-lg bg-white/10 hover:bg-white/20">
              <Bell className="h-5 w-5" />
              <span className="absolute top-1 right-1 h-2 w-2 bg-red-500 rounded-full" />
            </button>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2 text-sm text-blue-100">
          <CalendarDays className="h-4 w-4" />
          <span>Thursday, March 5, 2026</span>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto pb-20">
        <section className="p-4 space-y-3">
          <article className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 active:bg-gray-50">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">Today's Jobs</h3>
              <ChevronRight className="h-5 w-5 text-gray-400" />
            </div>
            <div className="mt-3 flex items-center gap-4 text-sm text-gray-600">
              <div className="flex items-center gap-2"><span className="h-2 w-2 bg-green-500 rounded-full" />10 completed</div>
              <div className="flex items-center gap-2"><span className="h-2 w-2 bg-amber-500 rounded-full" />2 remaining</div>
            </div>
          </article>

          <article className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 active:bg-gray-50">
            <p className="text-sm font-medium text-gray-600">Confirmed</p>
            <p className="text-4xl font-bold text-green-600 mt-2">10 / 12</p>
            <p className="text-xs text-gray-500 mt-1">On-time confirmations</p>
          </article>

          <article className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 active:bg-gray-50">
            <h3 className="text-sm font-semibold text-gray-700">Route Info</h3>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-gray-500">Distance</p>
                <p className="font-semibold text-gray-900">22.4 mi</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Drive Time</p>
                <p className="font-semibold text-gray-900">1h 18m</p>
              </div>
            </div>
          </article>

          <article className="bg-gradient-to-br from-green-500 to-green-600 rounded-lg shadow-md p-4 text-white">
            <p className="text-sm text-green-100">Revenue</p>
            <p className="text-4xl font-bold mt-1">$1,840</p>
            <p className="text-xs text-green-100 mt-1">Collected today</p>
          </article>
        </section>

        <section className="px-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-gray-900 font-semibold">Next Job</h2>
            <button type="button" className="text-sm text-blue-600 hover:text-blue-700">View All</button>
          </div>

          <article className="bg-white rounded-lg border-2 border-blue-200 shadow-sm p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-gray-900 font-semibold">Patterson Home</h3>
                <div className="mt-1 flex items-center gap-2 text-sm text-gray-600">
                  <Clock3 className="h-4 w-4" />
                  <span>10:30 AM - 11:30 AM</span>
                </div>
              </div>
              <span className="bg-blue-100 text-blue-800 text-xs font-semibold rounded-full px-3 py-1">Confirmed</span>
            </div>

            <div className="mt-4 space-y-2">
              <div className="flex items-start gap-2 text-sm text-gray-600">
                <MapPin className="h-4 w-4 mt-0.5" />
                <span>1247 Willow Creek Dr, Dallas, TX</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <House className="h-4 w-4" />
                <span>Quarterly Residential Service</span>
              </div>
            </div>

            <div className="mt-4 bg-amber-50 border border-amber-200 rounded p-3 text-sm text-amber-700">
              Gate code required. Customer requested backyard inspection first.
            </div>

            <div className="mt-4 flex items-center gap-2">
              <button type="button" className="flex-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 px-4 py-2.5 text-sm font-semibold">
                Navigate
              </button>
              <button type="button" className="p-2 hover:bg-gray-100 rounded-lg border border-gray-200">
                <Phone className="h-5 w-5 text-gray-600" />
              </button>
            </div>
          </article>
        </section>

        <section className="p-4">
          <h2 className="text-gray-900 font-semibold mb-3">Upcoming (3 jobs)</h2>
          <div className="space-y-2">
            {upcomingJobs.map((job) => (
              <article key={job.name} className="bg-white rounded-lg border border-gray-200 shadow-sm p-3 active:bg-gray-50">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{job.name}</p>
                    <p className="text-xs text-gray-600 mt-0.5">{job.time}</p>
                    <p className="text-xs text-gray-500 mt-1 truncate">{job.address}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-gray-400" />
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>

      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white border-t border-gray-200 px-4 py-3">
        <div className="grid grid-cols-4 gap-2">
          {bottomNav.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                type="button"
                className={
                  item.active
                    ? "flex flex-col items-center gap-1 text-blue-600"
                    : "flex flex-col items-center gap-1 text-gray-400 hover:text-gray-600"
                }
              >
                <Icon className="h-5 w-5" />
                <span className="text-xs">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

