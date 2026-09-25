import { NextResponse } from 'next/server';
import { getRoomSnapshot, RoomNotFoundError } from '@/lib/room-service';

export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const url = new URL(request.url);
    const playerId = url.searchParams.get('playerId') || '';
    const token = request.headers.get('x-room-token') || '';
    return NextResponse.json(await getRoomSnapshot(code, playerId, token));
  } catch (error) {
    const status = error instanceof RoomNotFoundError ? 404 : 401;
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not load the room.' }, { status });
  }
}
