import { NextResponse } from 'next/server';
import { performRoomAction, RoomNotFoundError } from '@/lib/room-service';

export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const body = await request.json() as Record<string, unknown>;
    const playerId = String(body.playerId || '');
    const token = request.headers.get('x-room-token') || '';
    return NextResponse.json(await performRoomAction(code, playerId, token, body));
  } catch (error) {
    const status = error instanceof RoomNotFoundError ? 404 : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : 'The room action failed.' }, { status });
  }
}
