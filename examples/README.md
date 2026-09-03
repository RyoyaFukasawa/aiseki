# Examples

These examples show the intended usage of Aiseki as a Model layer on top of
Drizzle ORM.

- `models.ts` defines a Drizzle table and its Aiseki Model.
- `drizzle-sqlite.ts` uses the Model with a local SQLite database.
- `hono-d1-context.ts` creates a request-scoped context for a Hono + D1 app.

The Hono example does not import Hono itself. Aiseki is framework-agnostic;
the context factory can be called from a Hono middleware or route handler.

Run the example typecheck with:

```bash
pnpm run typecheck:examples
```
