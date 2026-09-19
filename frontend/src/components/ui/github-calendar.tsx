import * as React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"

interface ContributionDay {
    color: string
    contributionCount: number
    contributionLevel: "NONE" | "FIRST_QUARTILE" | "SECOND_QUARTILE" | "THIRD_QUARTILE" | "FOURTH_QUARTILE"
    date: string
}

export interface ActivityDay {
    date: string
    count: number
}

interface GithubCalendarProps {
    /** Adapted from the Componentry component, which fetched a GitHub username
     *  from an external API. This app has its own activity to show and should
     *  not make third-party calls, so it takes the days directly. */
    days: ActivityDay[]
    label?: string
    unit?: string
    variant?: "default" | "city-lights" | "minimal"
    shape?: "square" | "rounded" | "circle" | "squircle"
    glowIntensity?: number
    className?: string
    showTotal?: boolean
    colorSchema?: "green" | "blue" | "purple" | "orange" | "gray"
}

// Color schemas for custom styling
const colorSchemas = {
    gray: {
        level0: "bg-zinc-100 dark:bg-zinc-900",
        level1: "bg-zinc-300 dark:bg-zinc-800",
        level2: "bg-zinc-400 dark:bg-zinc-700",
        level3: "bg-zinc-600 dark:bg-zinc-500",
        level4: "bg-zinc-800 dark:bg-zinc-300",
    },
    green: {
        level0: "bg-zinc-100 dark:bg-zinc-900",
        level1: "bg-emerald-200 dark:bg-emerald-900",
        level2: "bg-emerald-300 dark:bg-emerald-700",
        level3: "bg-emerald-400 dark:bg-emerald-500",
        level4: "bg-emerald-500 dark:bg-emerald-400",
    },
    blue: {
        level0: "bg-zinc-100 dark:bg-zinc-900",
        level1: "bg-blue-200 dark:bg-blue-900",
        level2: "bg-blue-300 dark:bg-blue-700",
        level3: "bg-blue-400 dark:bg-blue-500",
        level4: "bg-blue-500 dark:bg-blue-400",
    },
    purple: {
        level0: "bg-zinc-100 dark:bg-zinc-900",
        level1: "bg-purple-200 dark:bg-purple-900",
        level2: "bg-purple-300 dark:bg-purple-700",
        level3: "bg-purple-400 dark:bg-purple-500",
        level4: "bg-purple-500 dark:bg-purple-400",
    },
    orange: {
        level0: "bg-zinc-100 dark:bg-zinc-900",
        level1: "bg-orange-200 dark:bg-orange-900",
        level2: "bg-orange-300 dark:bg-orange-700",
        level3: "bg-orange-400 dark:bg-orange-500",
        level4: "bg-orange-500 dark:bg-orange-400",
    },
}

/** Steps of the UI accent rather than a stock Tailwind ramp, so the grid reads
 *  as part of this product. Sequential: one hue, light to dark. */
const ACCENT_STEPS = [
    "bg-[var(--act-0)]",
    "bg-[var(--act-1)]",
    "bg-[var(--act-2)]",
    "bg-[var(--act-3)]",
    "bg-[var(--act-4)]",
] as const

function getLevelClass(level: string, schema: keyof typeof colorSchemas = "green") {
    if (schema === "green") {
        const i = { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 }[level] ?? 0
        return ACCENT_STEPS[i]
    }
    const s = colorSchemas[schema]
    switch (level) {
        case "FIRST_QUARTILE":
            return s.level1
        case "SECOND_QUARTILE":
            return s.level2
        case "THIRD_QUARTILE":
            return s.level3
        case "FOURTH_QUARTILE":
            return s.level4
        case "NONE":
        default:
            return s.level0
    }
}

function getShapeClass(shape: string) {
    switch (shape) {
        case "circle":
            return "rounded-full"
        case "square":
            return "rounded-none"
        case "squircle":
            return "rounded-sm" // Approximation
        case "rounded":
        default:
            return "rounded-[2px]"
    }
}

export function GithubCalendar({
    days,
    label = "Activity",
    unit = "events",
    variant = "default",
    shape = "rounded",
    glowIntensity = 5,
    className,
    showTotal = true,
    colorSchema = "green",
}: GithubCalendarProps) {
    const [hoveredDate, setHoveredDate] = React.useState<string | null>(null)
    const [hoveredCount, setHoveredCount] = React.useState<number | null>(null)
    const [mousePos, setMousePos] = React.useState({ x: 0, y: 0 })

    const { weeks, total } = React.useMemo(() => {
        const counts = days.map((d) => d.count).filter((n) => n > 0).sort((a, b) => a - b)
        // Quartiles of the ACTIVE days only. Bucketing across all days would put
        // every real day in the top bucket as soon as most days are empty.
        const q = (f: number) => counts[Math.min(counts.length - 1, Math.floor(counts.length * f))] ?? 0
        const [q1, q2, q3] = [q(0.25), q(0.5), q(0.75)]
        const level = (n: number): ContributionDay["contributionLevel"] =>
            n <= 0 ? "NONE"
            : n <= q1 ? "FIRST_QUARTILE"
            : n <= q2 ? "SECOND_QUARTILE"
            : n <= q3 ? "THIRD_QUARTILE"
            : "FOURTH_QUARTILE"

        const cells: ContributionDay[] = days.map((d) => ({
            date: d.date, contributionCount: d.count, color: "", contributionLevel: level(d.count),
        }))
        // pad the first week so rows line up with the weekday the range starts on
        const lead = cells.length ? new Date(cells[0].date + "T00:00:00").getDay() : 0
        const padded = [
            ...Array.from({ length: lead }, () => null),
            ...cells,
        ] as (ContributionDay | null)[]

        const out: (ContributionDay | null)[][] = []
        for (let i = 0; i < padded.length; i += 7) out.push(padded.slice(i, i + 7))
        return { weeks: out, total: days.reduce((sum, d) => sum + d.count, 0) }
    }, [days])

    return (
        <div className={cn("w-max max-w-full flex flex-col gap-4", className)}>
            {showTotal && (
                <div className="flex items-baseline justify-between gap-4">
                    <span className="text-sm font-medium">{label}</span>
                    <span className="tabular text-xs text-muted-foreground">
                        {total.toLocaleString()} {unit} over {days.length} days
                    </span>
                </div>
            )}

            <div
                className="relative flex flex-nowrap gap-[3px] w-max max-w-full"
                onMouseLeave={() => {
                    setHoveredDate(null)
                    setHoveredCount(null)
                }}
            >
                {/* Simple Tooltip */}
                <AnimatePresence>
                    {hoveredDate && (
                        <motion.div
                            initial={{ opacity: 0, y: 10, scale: 0.9 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 5, scale: 0.9 }}
                            transition={{ duration: 0.2 }}
                            className="absolute z-50 pointer-events-none px-3 py-1.5 bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 text-xs rounded-md shadow-xl whitespace-nowrap"
                            style={{
                                left: mousePos.x,
                                top: mousePos.y - 40,
                                transform: "translateX(-50%)"
                            }}
                        >
                            <span className="font-bold mr-1">{hoveredCount}</span>
                            <span className="text-zinc-400 dark:text-zinc-500">{unit} on {hoveredDate}</span>
                        </motion.div>
                    )}
                </AnimatePresence>

                {weeks.map((week, weekIndex) => (
                    <div key={weekIndex} className="flex flex-col gap-[3px] w-[14px]">
                        {week.map((day, dayIndex) => {
                            if (!day) return <div key={`pad-${dayIndex}`} className="w-full aspect-square" />
                            const isGlowing = variant === "city-lights" && day.contributionCount > 0;
                            const isMinimal = variant === "minimal";
                            const shapeClass = getShapeClass(shape);

                            return (
                                <motion.div
                                    key={day.date}
                                    initial={{ opacity: 0, scale: 0 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{
                                        delay: weekIndex * 0.01 + dayIndex * 0.01,
                                        type: "spring",
                                        stiffness: 260,
                                        damping: 20
                                    }}
                                    onMouseEnter={(e) => {
                                        setHoveredDate(day.date)
                                        setHoveredCount(day.contributionCount)
                                        const rect = e.currentTarget.getBoundingClientRect()
                                        const parentRect = e.currentTarget.offsetParent!.getBoundingClientRect()
                                        setMousePos({
                                            x: rect.left - parentRect.left + rect.width / 2,
                                            y: rect.top - parentRect.top
                                        })
                                    }}
                                    className={cn(
                                        "w-full aspect-square transition-colors duration-200",
                                        getLevelClass(day.contributionLevel, colorSchema),
                                        isGlowing && "z-10",
                                        shapeClass,
                                        isMinimal && "rounded-full scale-75",
                                    )}
                                    style={
                                        isGlowing ? {
                                            boxShadow: day.contributionLevel !== "NONE"
                                                ? `0 0 ${day.contributionCount > 3 ? `${glowIntensity * 1.5}px` : `${glowIntensity}px`} ${colorSchema === 'green' ? 'var(--accent)' :
                                                    colorSchema === 'blue' ? '#3b82f6' :
                                                        colorSchema === 'purple' ? '#a855f7' :
                                                            '#f97316'
                                                }`
                                                : 'none'
                                        } : undefined
                                    }
                                />
                            )
                        })}
                    </div>
                ))}
            </div>
        </div>
    )
}
