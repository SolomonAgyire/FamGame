import { NextResponse } from 'next/server';
import { joinRoom } from '@/lib/room-service';

export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const body = await request.json() as { name?: string };
    return NextResponse.json(await joinRoom(code, body.name || ''), { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not join the room.' }, { status: 400 });
  }
}
