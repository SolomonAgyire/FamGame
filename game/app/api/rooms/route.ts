import { NextResponse } from 'next/server';
import { createRoom } from '@/lib/room-service';

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const result = await createRoom(String(body.name || ''), (body.settings || {}) as never, String(body.mode || 'individuals'));
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Room creation failed.' }, { status: 400 });
  }
}
