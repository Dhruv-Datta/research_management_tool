import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/AuthContext";
import DisableScrollOnNumberInputs from "@/components/DisableScrollOnNumberInputs";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-plus-jakarta",
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata = {
  title: "Fund Management System",
  description: "Portfolio tracking and research management tool",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${plusJakarta.variable} font-[family-name:var(--font-plus-jakarta)] antialiased`}>
        <AuthProvider>
          <DisableScrollOnNumberInputs />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
