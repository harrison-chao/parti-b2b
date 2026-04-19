import { NextResponse } from "next/server";

export function ok<T>(data: T, message = "success") {
  return NextResponse.json({ code: 0, message, data });
}
export function fail(message: string, code = 1, status = 400) {
  return NextResponse.json({ code, message, data: null }, { status });
}
