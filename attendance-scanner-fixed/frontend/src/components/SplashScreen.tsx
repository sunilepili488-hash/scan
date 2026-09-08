import { motion } from "framer-motion";
import { useEffect } from "react";

export default function SplashScreen({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3400);
    return () => clearTimeout(t);
  }, [onDone]);

  const letters = "AttendScan".split("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-indigo overflow-hidden">
      {/* subtle drifting particles */}
      {Array.from({ length: 14 }).map((_, i) => (
        <motion.span
          key={i}
          className="absolute rounded-full bg-amber/40"
          style={{
            width: 3 + (i % 3) * 2,
            height: 3 + (i % 3) * 2,
            left: `${(i * 37) % 100}%`,
            top: `${(i * 53) % 100}%`,
          }}
          initial={{ opacity: 0, y: 0 }}
          animate={{ opacity: [0, 0.8, 0], y: -40 }}
          transition={{ duration: 2.6, delay: i * 0.12, repeat: Infinity, repeatDelay: 0.6 }}
        />
      ))}

      <div className="flex flex-col items-center">
        {/* logo mark: a scanning frame drawing itself */}
        <motion.svg
          width="72"
          height="72"
          viewBox="0 0 72 72"
          initial="hidden"
          animate="visible"
          className="mb-6"
        >
          {[
            "M8 24V12a4 4 0 0 1 4-4h12",
            "M64 24V12a4 4 0 0 0-4-4H48",
            "M8 48v12a4 4 0 0 0 4 4h12",
            "M64 48v12a4 4 0 0 1-4 4H48",
          ].map((d, i) => (
            <motion.path
              key={d}
              d={d}
              stroke="#F5B301"
              strokeWidth="4"
              strokeLinecap="round"
              fill="none"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.15 * i, ease: "easeOut" }}
            />
          ))}
          <motion.rect
            x="14"
            y="14"
            width="44"
            height="44"
            rx="6"
            fill="#F5B301"
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 0.12, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.7 }}
          />
        </motion.svg>

        <div className="flex font-display text-3xl font-bold tracking-tight text-cream">
          {letters.map((ch, i) => (
            <motion.span
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.9 + i * 0.045 }}
            >
              {ch}
            </motion.span>
          ))}
        </div>

        <motion.p
          className="mt-2 text-sm text-cream/60"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 1.9 }}
        >
          Attendance, scanned in seconds
        </motion.p>
      </div>
    </div>
  );
}
