import type { ActionAPIContext } from "astro:actions";
import { defineAction, ActionError } from "astro:actions";
import { z } from "astro:schema";
import {
  and,
  asc,
  db,
  desc,
  eq,
  SleepLogs,
  SleepRoutineSteps,
  SleepRoutines,
} from "astro:db";

function requireUser(context: ActionAPIContext) {
  const locals = context.locals as App.Locals | undefined;
  const user = locals?.user;

  if (!user) {
    throw new ActionError({
      code: "UNAUTHORIZED",
      message: "You must be signed in to perform this action.",
    });
  }

  return user;
}

const routineStepInput = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  minutesBeforeBed: z.number().int().optional(),
  orderIndex: z.number().int().min(1).optional(),
});

const routineBaseFields = {
  name: z.string().min(1),
  goalDescription: z.string().optional(),
  targetBedTimeLocal: z.string().optional(),
  targetWakeTimeLocal: z.string().optional(),
  timeZone: z.string().optional(),
  notes: z.string().optional(),
};

const sleepLogFields = {
  routineId: z.string().optional(),
  sleepDate: z.coerce.date().optional(),
  bedTime: z.coerce.date().optional(),
  wakeTime: z.coerce.date().optional(),
  sleepQualityScore: z.number().int().min(1).max(10).optional(),
  notes: z.string().optional(),
};

export const server = {
  createRoutine: defineAction({
    input: z
      .object({
        steps: z.array(routineStepInput).optional(),
      })
      .extend(routineBaseFields),
    handler: async (input, context) => {
      const user = requireUser(context);
      const now = new Date();
      const routineId = crypto.randomUUID();

      await db.insert(SleepRoutines).values({
        id: routineId,
        userId: user.id,
        name: input.name,
        goalDescription: input.goalDescription,
        targetBedTimeLocal: input.targetBedTimeLocal,
        targetWakeTimeLocal: input.targetWakeTimeLocal,
        timeZone: input.timeZone,
        notes: input.notes,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });

      if (input.steps?.length) {
        const stepValues = input.steps.map((step, index) => ({
          id: crypto.randomUUID(),
          routineId,
          orderIndex: step.orderIndex ?? index + 1,
          title: step.title,
          description: step.description,
          minutesBeforeBed: step.minutesBeforeBed,
          createdAt: now,
        }));

        await db.insert(SleepRoutineSteps).values(stepValues);
      }

      return {
        success: true,
        data: {
          id: routineId,
        },
      };
    },
  }),

  updateRoutine: defineAction({
    input: z
      .object({
        id: z.string(),
        steps: z.array(routineStepInput).optional(),
      })
      .extend(
        Object.fromEntries(
          Object.entries(routineBaseFields).map(([key, schema]) => [
            key,
            (schema as z.ZodTypeAny).optional(),
          ])
        )
      ),
    handler: async (input, context) => {
      const user = requireUser(context);
      const existing = await db
        .select()
        .from(SleepRoutines)
        .where(and(eq(SleepRoutines.id, input.id), eq(SleepRoutines.userId, user.id)));

      const routine = existing[0];

      if (!routine) {
        throw new ActionError({
          code: "NOT_FOUND",
          message: "Sleep routine not found.",
        });
      }

      const now = new Date();
      const updateData: Partial<typeof SleepRoutines.$inferInsert> = {
        updatedAt: now,
      };

      (Object.keys(routineBaseFields) as (keyof typeof routineBaseFields)[]).forEach(
        (key) => {
          if (key in input && input[key] !== undefined) {
            // @ts-expect-error indexing
            updateData[key] = input[key];
          }
        }
      );

      if (Object.keys(updateData).length > 0) {
        await db
          .update(SleepRoutines)
          .set(updateData)
          .where(and(eq(SleepRoutines.id, input.id), eq(SleepRoutines.userId, user.id)));
      }

      if (input.steps) {
        await db
          .delete(SleepRoutineSteps)
          .where(eq(SleepRoutineSteps.routineId, input.id));

        if (input.steps.length) {
          const stepValues = input.steps.map((step, index) => ({
            id: crypto.randomUUID(),
            routineId: input.id,
            orderIndex: step.orderIndex ?? index + 1,
            title: step.title,
            description: step.description,
            minutesBeforeBed: step.minutesBeforeBed,
            createdAt: now,
          }));

          await db.insert(SleepRoutineSteps).values(stepValues);
        }
      }

      return {
        success: true,
      };
    },
  }),

  archiveRoutine: defineAction({
    input: z.object({ id: z.string() }),
    handler: async (input, context) => {
      const user = requireUser(context);
      const updated = await db
        .update(SleepRoutines)
        .set({
          isActive: false,
          updatedAt: new Date(),
        })
        .where(and(eq(SleepRoutines.id, input.id), eq(SleepRoutines.userId, user.id)));

      if (updated.rowsAffected === 0) {
        throw new ActionError({
          code: "NOT_FOUND",
          message: "Sleep routine not found.",
        });
      }

      return {
        success: true,
      };
    },
  }),

  getRoutineWithSteps: defineAction({
    input: z.object({ id: z.string() }),
    handler: async (input, context) => {
      const user = requireUser(context);
      const routines = await db
        .select()
        .from(SleepRoutines)
        .where(and(eq(SleepRoutines.id, input.id), eq(SleepRoutines.userId, user.id)));

      const routine = routines[0];

      if (!routine) {
        throw new ActionError({
          code: "NOT_FOUND",
          message: "Sleep routine not found.",
        });
      }

      const steps = await db
        .select()
        .from(SleepRoutineSteps)
        .where(eq(SleepRoutineSteps.routineId, input.id))
        .orderBy(asc(SleepRoutineSteps.orderIndex));

      return {
        success: true,
        data: {
          routine,
          steps,
        },
      };
    },
  }),

  listMyRoutines: defineAction({
    input: z.object({ includeInactive: z.boolean().default(false) }),
    handler: async (input, context) => {
      const user = requireUser(context);
      const filters = [eq(SleepRoutines.userId, user.id)];

      if (!input.includeInactive) {
        filters.push(eq(SleepRoutines.isActive, true));
      }

      const routines = await db
        .select()
        .from(SleepRoutines)
        .where(and(...filters))
        .orderBy(desc(SleepRoutines.updatedAt));

      return {
        success: true,
        data: {
          items: routines,
          total: routines.length,
        },
      };
    },
  }),

  createSleepLog: defineAction({
    input: z.object(sleepLogFields),
    handler: async (input, context) => {
      const user = requireUser(context);
      const now = new Date();

      if (input.routineId) {
        const routine = await db
          .select({ id: SleepRoutines.id })
          .from(SleepRoutines)
          .where(and(eq(SleepRoutines.id, input.routineId), eq(SleepRoutines.userId, user.id)));

        if (!routine[0]) {
          throw new ActionError({
            code: "FORBIDDEN",
            message: "You cannot log sleep for this routine.",
          });
        }
      }

      const logId = crypto.randomUUID();

      await db.insert(SleepLogs).values({
        id: logId,
        userId: user.id,
        routineId: input.routineId,
        sleepDate: input.sleepDate ?? now,
        bedTime: input.bedTime,
        wakeTime: input.wakeTime,
        sleepQualityScore: input.sleepQualityScore,
        notes: input.notes,
        createdAt: now,
      });

      return {
        success: true,
        data: {
          id: logId,
        },
      };
    },
  }),

  updateSleepLog: defineAction({
    input: z
      .object({
        id: z.string(),
      })
      .extend(
        Object.fromEntries(
          Object.entries(sleepLogFields).map(([key, schema]) => [
            key,
            (schema as z.ZodTypeAny).optional(),
          ])
        )
      ),
    handler: async (input, context) => {
      const user = requireUser(context);

      const logs = await db
        .select()
        .from(SleepLogs)
        .where(and(eq(SleepLogs.id, input.id), eq(SleepLogs.userId, user.id)));

      const log = logs[0];

      if (!log) {
        throw new ActionError({
          code: "NOT_FOUND",
          message: "Sleep log not found.",
        });
      }

      if (input.routineId) {
        const routine = await db
          .select({ id: SleepRoutines.id })
          .from(SleepRoutines)
          .where(and(eq(SleepRoutines.id, input.routineId), eq(SleepRoutines.userId, user.id)));

        if (!routine[0]) {
          throw new ActionError({
            code: "FORBIDDEN",
            message: "You cannot log sleep for this routine.",
          });
        }
      }

      const updateData: Partial<typeof SleepLogs.$inferInsert> = {};

      (Object.keys(sleepLogFields) as (keyof typeof sleepLogFields)[]).forEach((key) => {
        if (key in input && input[key] !== undefined) {
          // @ts-expect-error dynamic assignment
          updateData[key] = input[key];
        }
      });

      if (Object.keys(updateData).length > 0) {
        await db
          .update(SleepLogs)
          .set(updateData)
          .where(and(eq(SleepLogs.id, input.id), eq(SleepLogs.userId, user.id)));
      }

      return {
        success: true,
      };
    },
  }),

  listSleepLogs: defineAction({
    input: z.object({
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(20),
      routineId: z.string().optional(),
    }),
    handler: async (input, context) => {
      const user = requireUser(context);
      const filters = [eq(SleepLogs.userId, user.id)];

      if (input.routineId) {
        filters.push(eq(SleepLogs.routineId, input.routineId));
      }

      const offset = (input.page - 1) * input.pageSize;

      const logs = await db
        .select()
        .from(SleepLogs)
        .where(and(...filters))
        .orderBy(desc(SleepLogs.sleepDate), desc(SleepLogs.createdAt))
        .limit(input.pageSize)
        .offset(offset);

      return {
        success: true,
        data: {
          items: logs,
          page: input.page,
          pageSize: input.pageSize,
          total: logs.length,
        },
      };
    },
  }),
};
