import { auth } from '@/auth';
import { prisma } from '@/prisma';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    // Fetch all user data with relations
    const userData = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        accounts: {
          select: {
            provider: true,
            type: true,
            createdAt: true,
          },
        },
        sessions: {
          select: {
            expires: true,
            createdAt: true,
          },
        },
        emailHistory: true,
        senderProfiles: {
          include: {
            bankAccounts: true,
          },
        },
        customers: {
          include: {
            customPrices: {
              include: {
                product: {
                  select: {
                    name: true,
                    unit: true,
                  },
                },
              },
            },
          },
        },
        products: {
          include: {
            customPrices: {
              include: {
                customer: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!userData) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Fetch invoices separately due to complexity
    const invoices = await prisma.invoice.findMany({
      where: {
        senderProfile: {
          userId: userId,
        },
      },
      include: {
        items: true,
      },
    });

    // Combine all data
    const exportData = {
      exportDate: new Date().toISOString(),
      exportVersion: '1.0',
      user: {
        id: userData.id,
        name: userData.name,
        email: userData.email,
        emailVerified: userData.emailVerified,
        image: userData.image,
        createdAt: userData.createdAt,
        updatedAt: userData.updatedAt,
      },
      accounts: userData.accounts,
      sessions: userData.sessions,
      emailHistory: userData.emailHistory,
      senderProfiles: userData.senderProfiles,
      customers: userData.customers,
      products: userData.products,
      invoices: invoices,
    };

    // Convert to JSON string with formatting
    const jsonData = JSON.stringify(exportData, null, 2);

    // Return as downloadable file
    return new NextResponse(jsonData, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename="invoice-forge-data.json"',
      },
    });
  } catch (error) {
    console.error('Error exporting user data:', error);
    return NextResponse.json(
      { error: 'Failed to export data' },
      { status: 500 }
    );
  }
}
