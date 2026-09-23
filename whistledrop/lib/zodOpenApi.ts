import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

// Adds .openapi() to Zod so lib/openapi.ts can register the validation schemas
// as OpenAPI components. Zod 4 copies methods onto each schema when it is
// created, so this must run before any schema is defined: lib/validation.ts
// imports this module first.
extendZodWithOpenApi(z);
