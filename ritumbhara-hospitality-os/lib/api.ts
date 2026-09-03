export function successResponse(data: any, status = 200, message?: string) {
  return Response.json({
    success: true,
    data,
    message
  }, { status })
}

export function errorResponse(message: string, status = 400, error?: any) {
  return Response.json({
    success: false,
    message,
    error: error?.message || error
  }, { status })
}
