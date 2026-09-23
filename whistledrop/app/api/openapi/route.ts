import { getOpenApiDocument } from "@/lib/openapi";
import { apiSuccess } from "@/lib/apiResponse";

export function GET() {
  return apiSuccess(getOpenApiDocument());
}
