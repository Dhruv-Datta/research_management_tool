import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import { CacheProvider } from "@/lib/CacheContext";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-plus-jakarta",
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata = {
  title: "Research Management",
  description: "Portfolio tracking and research management tool",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${plusJakarta.variable} font-[family-name:var(--font-plus-jakarta)] antialiased`}>
        <CacheProvider>
          <Navbar />
          <main className="pt-20">
            {children}
          </main>
        </CacheProvider>
      </body>
    </html>
  );
}
