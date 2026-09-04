import { z } from "zod";

export type ApiResponse<T = any> = {
  success: boolean;
  data?: T;
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

/**
 * Standardized success response
 */
export function successResponse<T>(data: T): ApiResponse<T> {
  return {
    success: true,
    data,
  };
}

/**
 * Standardized error response
 */
export function errorResponse(error: string | Error): ApiResponse {
  return {
    success: false,
    error: error instanceof Error ? error.message : error,
  };
}

/**
 * Zod validation error response
 */
export function validationErrorResponse(error: z.ZodError): ApiResponse {
  return {
    success: false,
    error: "Validation failed",
    fieldErrors: error.flatten().fieldErrors,
  };
}

/**
 * Catch-all action wrapper for consistent error handling and logging
 */
export async function withAction<T>(
  action: () => Promise<T>,
  actionName: string
): Promise<ApiResponse<T>> {
  try {
    const result = await action();
    return successResponse(result);
  } catch (error) {
    console.error(`[ACTION ERROR] ${actionName}:`, error);
    if (error instanceof z.ZodError) {
      return validationErrorResponse(error);
    }
    return errorResponse(error as Error);
  }
}
