import Navbar from "@/components/Navbar";
import { CacheProvider } from "@/lib/CacheContext";
import AuthGate from "@/components/AuthGate";

export default function DashboardLayout({ children }) {
  return (
    <AuthGate>
      <CacheProvider>
        <div className="min-h-screen relative bg-white">
          {/* Ambient background glows — fixed so they stay while scrolling */}
          <div className="fixed inset-0 pointer-events-none overflow-hidden">
            <div className="absolute top-[-5%] left-[-2%] w-[300px] h-[300px] bg-emerald-200/12 rounded-full blur-[100px]" />
            <div className="absolute top-[40%] right-[5%] w-[250px] h-[250px] bg-teal-200/10 rounded-full blur-[90px]" />
            <div className="absolute bottom-[5%] left-[25%] w-[280px] h-[280px] bg-emerald-200/10 rounded-full blur-[100px]" />
          </div>
          <div className="relative z-10">
            <Navbar />
            <main className="pt-20">
              {children}
            </main>
          </div>
        </div>
      </CacheProvider>
    </AuthGate>
  );
}
