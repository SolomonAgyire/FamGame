import { NextResponse } from 'next/server';
import { getRoom, publicSnapshot, roomAction } from '@/lib/room-service';

export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const body = await request.json() as Record<string, unknown>;
    const playerId = String(body.playerId || '');
    const token = request.headers.get('x-room-token') || '';
    const room = await getRoom(code);
    if (!room || room.expires_at < Date.now()) return NextResponse.json({ error: 'That room was not found or has expired.' }, { status: 404 });
    const updated = await roomAction(room, playerId, token, body);
    if (!updated) throw new Error('The room could not be reloaded.');
    return NextResponse.json(publicSnapshot(updated, playerId));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'The room action failed.' }, { status: 400 });
  }
}
