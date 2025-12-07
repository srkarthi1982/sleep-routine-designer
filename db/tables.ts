/**
 * Sleep Routine Designer - create bedtime routines and log sleep.
 *
 * Design goals:
 * - User can define routines with ordered steps (pre-sleep ritual).
 * - Separate sleep logs to track real bed/wake times & quality.
 */

import { defineTable, column, NOW } from "astro:db";

export const SleepRoutines = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    userId: column.text(),

    name: column.text(),                             // "Weekday routine", "Travel routine"
    goalDescription: column.text({ optional: true }),// "Sleep by 11 PM, wake at 6 AM"

    targetBedTimeLocal: column.text({ optional: true }), // "23:00" as local-time string
    targetWakeTimeLocal: column.text({ optional: true }),// "06:00"
    timeZone: column.text({ optional: true }),       // IANA tz, e.g. "Asia/Dubai"

    notes: column.text({ optional: true }),
    isActive: column.boolean({ default: true }),

    createdAt: column.date({ default: NOW }),
    updatedAt: column.date({ default: NOW }),
  },
});

export const SleepRoutineSteps = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    routineId: column.text({
      references: () => SleepRoutines.columns.id,
    }),

    orderIndex: column.number(),                     // 1, 2, 3...
    title: column.text(),                            // "Turn off screens", "Light stretching"
    description: column.text({ optional: true }),

    // Minutes before target bedtime; negative numbers are okay if needed
    minutesBeforeBed: column.number({ optional: true }),

    createdAt: column.date({ default: NOW }),
  },
});

export const SleepLogs = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    userId: column.text(),

    routineId: column.text({
      references: () => SleepRoutines.columns.id,
      optional: true,
    }),

    sleepDate: column.date({ default: NOW }),        // logical date (e.g. night of 2025-12-06)
    bedTime: column.date({ optional: true }),        // actual timestamp went to bed
    wakeTime: column.date({ optional: true }),       // actual timestamp woke up

    sleepQualityScore: column.number({ optional: true }), // 1-10
    notes: column.text({ optional: true }),

    createdAt: column.date({ default: NOW }),
  },
});

export const tables = {
  SleepRoutines,
  SleepRoutineSteps,
  SleepLogs,
} as const;
