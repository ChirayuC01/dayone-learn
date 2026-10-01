import type { Metadata } from "next";
import { Atkinson_Hyperlegible, Bricolage_Grotesque, JetBrains_Mono } from "next/font/google";
import { TimezoneSync } from "@/components/TimezoneSync";
import { getViewer } from "@/lib/learning/learner";
import "./globals.css";
import { Providers } from "./providers";

const atkinson = Atkinson_Hyperlegible({
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
  variable: "--font-atkinson",
});
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], weight: ["600", "800"], variable: "--font-bricolage" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "600"], variable: "--font-jetbrains" });

export const metadata: Metadata = {
  title: { default: "DayOne", template: "%s · DayOne" },
  description: "Learn one 15-minute lesson a day.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  return (
    <html lang="en" className={`${atkinson.variable} ${bricolage.variable} ${jetbrains.variable}`}>
      <body>
        <Providers>{children}</Providers>
        {viewer && !viewer.timezoneConfirmed && <TimezoneSync />}
      </body>
    </html>
  );
}
