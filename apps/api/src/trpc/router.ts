import { router } from "./init";
import { beansRouter } from "./routers/beans";
import { meRouter } from "./routers/me";
import { recipesRouter } from "./routers/recipes";
import { reviewsRouter } from "./routers/reviews";
import { scannerRouter } from "./routers/scanner";
import { shelfRouter } from "./routers/shelf";

export const appRouter = router({
  beans: beansRouter,
  reviews: reviewsRouter,
  recipes: recipesRouter,
  shelf: shelfRouter,
  scanner: scannerRouter,
  me: meRouter,
});

export type AppRouter = typeof appRouter;
