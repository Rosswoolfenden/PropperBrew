import { router } from "./init";
import { beansRouter } from "./routers/beans";
import { businessRouter } from "./routers/business";
import { meRouter } from "./routers/me";
import { usersRouter } from "./routers/users";
import { basketRouter } from "./routers/basket";
import { ordersRouter } from "./routers/orders";
import { recipesRouter } from "./routers/recipes";
import { reviewsRouter } from "./routers/reviews";
import { roastersRouter } from "./routers/roasters";
import { scannerRouter } from "./routers/scanner";
import { shelfRouter } from "./routers/shelf";

export const appRouter = router({
  beans: beansRouter,
  business: businessRouter,
  roasters: roastersRouter,
  reviews: reviewsRouter,
  recipes: recipesRouter,
  shelf: shelfRouter,
  scanner: scannerRouter,
  me: meRouter,
  users: usersRouter,
  basket: basketRouter,
  orders: ordersRouter,
});

export type AppRouter = typeof appRouter;
