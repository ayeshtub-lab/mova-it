import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { momentId, witnessType, isAnonymous, content, mediaUrl } = body;

    if (!momentId || !witnessType) {
      return NextResponse.json(
        { success: false, error: 'momentId and witnessType are required' },
        { status: 400 }
      );
    }

    const record = {
      id: `w_${Date.now()}`,
      momentId,
      witnessType,
      isAnonymous: isAnonymous || false,
      content: content || null,
      mediaUrl: mediaUrl || null,
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json({
      success: true,
      message: 'Witness recorded successfully',
      data: record
    }, { status: 201 });
  } catch {
    return NextResponse.json(
      { success: false, error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}