import { NextResponse } from 'next/server';
import { authenticate, getRoom, publicSnapshot } from '@/lib/room-service';

export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const url = new URL(request.url);
    const playerId = url.searchParams.get('playerId') || '';
    const token = request.headers.get('x-room-token') || '';
    const room = await getRoom(code);
    if (!room || room.expires_at < Date.now()) return NextResponse.json({ error: 'That room was not found or has expired.' }, { status: 404 });
    await authenticate(room, playerId, token);
    return NextResponse.json(publicSnapshot(room, playerId));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not load the room.' }, { status: 401 });
  }
}
