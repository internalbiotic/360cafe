import 'dotenv/config';
import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import { and, asc, desc, eq, gt, inArray, isNull } from 'drizzle-orm';
import { db } from './src/db/index.ts';
import {
  categories,
  orderItemCustomizations,
  orderItems,
  orders,
  productCustomizations,
  products,
  profileLinkTokens,
  profiles,
  restaurantSettings,
} from './src/db/schema.ts';
import {
  getFullOrderById,
  getFullOrderByNumber,
  getStorefrontData,
  listOrdersWithDetails,
} from './src/db/queries.ts';
import { ensureSeeded } from './src/db/seed.ts';
import {
  checkSupabaseConnection,
  isSupabaseServerConfigured,
} from './src/lib/supabase-server.ts';
import {
  AuthRequest,
  requireAdminOrOwner,
  requireAuth,
  requireOwner,
  requireStaffOrAbove,
  syncUserProfile,
  verifyAccessToken,
} from './src/middleware/auth.ts';

const PORT = Number(process.env.PORT) || 3000;
const ALLOWED_STATUSES = new Set([
  'New',
  'Confirmed',
  'Preparing',
  'Ready for pickup',
  'Out for delivery',
  'Completed',
  'Cancelled',
]);

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function sanitizeImageUrl(url: string): string {
  const trimmed = (url || '').trim();
  if (
    trimmed.startsWith('/') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('http://')
  ) {
    return trimmed;
  }
  return '/src/assets/images/drink_hot_espresso_1795554216923.jpg';
}

interface ExtendedWebSocket extends WebSocket {
  isAdmin?: boolean;
  trackedOrderNumber?: string;
}

async function startServer() {
  const app = express();
  app.set('trust proxy', true);
  app.use(express.json({ limit: '8mb' }));

  const uploadsDir = path.resolve(process.cwd(), 'public', 'uploads');
  fs.mkdirSync(uploadsDir, { recursive: true });
  app.use('/uploads', express.static(uploadsDir));

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: ExtendedWebSocket) => {
    ws.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg?.type === 'auth' && typeof msg.token === 'string') {
          const verified = await verifyAccessToken(msg.token);
          const profile = await syncUserProfile(verified);
          if (
            profile.role === 'owner' ||
            profile.role === 'admin' ||
            profile.role === 'staff'
          ) {
            ws.isAdmin = true;
            ws.send(JSON.stringify({ type: 'auth:ok', role: profile.role }));
          } else {
            ws.isAdmin = false;
            ws.send(JSON.stringify({ type: 'auth:denied' }));
          }
        } else if (msg?.type === 'track' && typeof msg.orderNumber === 'string') {
          ws.trackedOrderNumber = msg.orderNumber.trim();
        }
      } catch {
        ws.isAdmin = false;
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'auth:denied' }));
        }
      }
    });
  });

  function broadcastOrderEvent(eventType: 'order:created' | 'order:updated', order: any) {
    const adminPayload = JSON.stringify({ type: eventType, order });
    const publicPayload = JSON.stringify({
      type: eventType,
      order: {
        orderNumber: order.orderNumber,
        status: order.status,
        orderType: order.orderType,
        updatedAt: order.updatedAt,
      },
    });

    wss.clients.forEach((client: ExtendedWebSocket) => {
      if (client.readyState !== WebSocket.OPEN) return;
      if (client.isAdmin) {
        client.send(adminPayload);
      } else if (
        client.trackedOrderNumber &&
        client.trackedOrderNumber === order.orderNumber
      ) {
        client.send(publicPayload);
      }
    });
  }

  // Health endpoint
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, supabaseConfigured: isSupabaseServerConfigured() });
  });

  // Supabase connection diagnostics endpoint
  app.get('/api/supabase/health', async (_req, res) => {
    const status = await checkSupabaseConnection();
    res.status(status.configured && !status.reachable ? 502 : 200).json(status);
  });

  // Public Storefront endpoint (Categories, Products, Customizations, Restaurant Settings)
  app.get('/api/storefront', async (_req, res) => {
    try {
      const data = await getStorefrontData();
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to load storefront' });
    }
  });

  // Public Order Creation with Strict Server-Side Price Recalculation
  app.post('/api/orders', async (req, res) => {
    try {
      await ensureSeeded();

      const {
        customerName,
        customerPhone,
        orderType,
        deliveryAddress,
        deliveryLat,
        deliveryLng,
        specialInstructions,
        items,
      } = req.body || {};

      if (typeof customerName !== 'string' || customerName.trim().length < 2) {
        return res.status(400).json({ error: 'Please provide your full name.' });
      }
      if (typeof customerPhone !== 'string' || customerPhone.trim().length < 7) {
        return res.status(400).json({ error: 'Please provide a valid phone number.' });
      }
      if (orderType !== 'delivery' && orderType !== 'pickup') {
        return res.status(400).json({ error: 'Order type must be delivery or pickup.' });
      }
      if (
        orderType === 'delivery' &&
        (typeof deliveryAddress !== 'string' || deliveryAddress.trim().length < 5)
      ) {
        return res.status(400).json({ error: 'Please provide a delivery address.' });
      }
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Your cart is empty.' });
      }

      const settingsRows = await db.select().from(restaurantSettings).limit(1);
      const settings = settingsRows[0];
      if (!settings) {
        return res.status(500).json({ error: 'Restaurant settings are not configured.' });
      }

      const productIds = Array.from(
        new Set(
          items
            .map((i: any) => Number(i?.productId))
            .filter((id) => Number.isInteger(id) && id > 0)
        )
      );

      if (productIds.length === 0) {
        return res.status(400).json({ error: 'Invalid order items.' });
      }

      const dbProducts = await db
        .select()
        .from(products)
        .where(inArray(products.id, productIds));

      const dbCustomizations = await db
        .select()
        .from(productCustomizations)
        .where(inArray(productCustomizations.productId, productIds));

      const productMap: Record<number, (typeof dbProducts)[number]> = {};
      for (const p of dbProducts) productMap[p.id] = p;

      const custMap: Record<number, (typeof dbCustomizations)[number]> = {};
      for (const c of dbCustomizations) custMap[c.id] = c;

      interface PreparedLine {
        productId: number;
        productName: string;
        unitPriceEgp: number;
        quantity: number;
        lineTotalEgp: number;
        customizations: Array<{
          customizationId: number;
          groupName: string;
          optionName: string;
          priceDeltaEgp: number;
        }>;
      }

      const preparedLines: PreparedLine[] = [];
      let subtotalEgp = 0;

      for (const rawItem of items) {
        const pid = Number(rawItem?.productId);
        const qty = Number(rawItem?.quantity);
        if (!Number.isInteger(pid) || !Number.isInteger(qty) || qty < 1 || qty > 50) {
          return res.status(400).json({ error: 'Invalid product quantity.' });
        }

        const prod = productMap[pid];
        if (!prod) {
          return res.status(400).json({ error: 'One or more products no longer exist.' });
        }
        if (!prod.isAvailable) {
          return res
            .status(400)
            .json({ error: `${prod.name} is currently unavailable.` });
        }

        const basePrice =
          prod.promoPriceEgp !== null && prod.promoPriceEgp < prod.priceEgp
            ? prod.promoPriceEgp
            : prod.priceEgp;

        const requestedCustIds: number[] = Array.isArray(rawItem?.customizationIds)
          ? rawItem.customizationIds
              .map((id: any) => Number(id))
              .filter((id: number) => Number.isInteger(id) && id > 0)
          : [];

        let extrasDelta = 0;
        const lineCustomizations: PreparedLine['customizations'] = [];
        for (const cid of Array.from(new Set(requestedCustIds))) {
          const cust = custMap[cid];
          if (!cust || cust.productId !== prod.id) {
            return res
              .status(400)
              .json({ error: `Invalid customization option for ${prod.name}.` });
          }
          extrasDelta += cust.priceDeltaEgp;
          lineCustomizations.push({
            customizationId: cust.id,
            groupName: cust.groupName,
            optionName: cust.optionName,
            priceDeltaEgp: cust.priceDeltaEgp,
          });
        }

        const unitPriceEgp = Math.round((basePrice + extrasDelta) * 100) / 100;
        const lineTotalEgp = Math.round(unitPriceEgp * qty * 100) / 100;
        subtotalEgp += lineTotalEgp;

        preparedLines.push({
          productId: prod.id,
          productName: prod.name,
          unitPriceEgp,
          quantity: qty,
          lineTotalEgp,
          customizations: lineCustomizations,
        });
      }

      subtotalEgp = Math.round(subtotalEgp * 100) / 100;
      if (subtotalEgp < settings.minOrderEgp) {
        return res.status(400).json({
          error: `Minimum order amount is ${settings.minOrderEgp} EGP.`,
        });
      }

      const deliveryFeeEgp = orderType === 'delivery' ? settings.deliveryFeeEgp : 0;
      const totalEgp = Math.round((subtotalEgp + deliveryFeeEgp) * 100) / 100;
      const paymentMethod =
        orderType === 'delivery' ? 'cash_on_delivery' : 'pay_on_pickup';

      const orderNumber = `360-${Math.floor(10000 + Math.random() * 90000)}-${crypto
        .randomBytes(2)
        .toString('hex')
        .toUpperCase()}`;

      const createdOrderId = await db.transaction(async (tx) => {
        const [newOrder] = await tx
          .insert(orders)
          .values({
            orderNumber,
            customerName: customerName.trim().slice(0, 120),
            customerPhone: customerPhone.trim().slice(0, 40),
            orderType,
            deliveryAddress:
              orderType === 'delivery'
                ? String(deliveryAddress || '').trim().slice(0, 400)
                : 'In-store Pickup',
            deliveryLat:
              orderType === 'delivery' && typeof deliveryLat === 'number'
                ? deliveryLat
                : null,
            deliveryLng:
              orderType === 'delivery' && typeof deliveryLng === 'number'
                ? deliveryLng
                : null,
            specialInstructions: String(specialInstructions || '')
              .trim()
              .slice(0, 500),
            paymentMethod,
            status: 'New',
            subtotalEgp,
            deliveryFeeEgp,
            totalEgp,
          })
          .returning();

        for (const line of preparedLines) {
          const [newOrderItem] = await tx
            .insert(orderItems)
            .values({
              orderId: newOrder.id,
              productId: line.productId,
              productName: line.productName,
              unitPriceEgp: line.unitPriceEgp,
              quantity: line.quantity,
              lineTotalEgp: line.lineTotalEgp,
            })
            .returning();

          if (line.customizations.length > 0) {
            await tx.insert(orderItemCustomizations).values(
              line.customizations.map((c) => ({
                orderItemId: newOrderItem.id,
                customizationId: c.customizationId,
                groupName: c.groupName,
                optionName: c.optionName,
                priceDeltaEgp: c.priceDeltaEgp,
              }))
            );
          }
        }

        return newOrder.id;
      });

      const fullOrder = await getFullOrderById(createdOrderId);
      if (fullOrder) {
        broadcastOrderEvent('order:created', fullOrder);
      }

      res.status(201).json(fullOrder);
    } catch (error: any) {
      console.error('Order submission error:', error);
      res.status(500).json({ error: 'Unable to submit order. Please try again.' });
    }
  });

  // Public Order Status Tracking (PII-sanitized summary)
  app.get('/api/orders/:orderNumber', async (req, res) => {
    try {
      const orderNumber = String(req.params.orderNumber || '').trim();
      if (!orderNumber) {
        return res.status(400).json({ error: 'Order number required.' });
      }
      const order = await getFullOrderByNumber(orderNumber);
      if (!order) {
        return res.status(404).json({ error: 'Order not found.' });
      }
      res.json({
        orderNumber: order.orderNumber,
        status: order.status,
        orderType: order.orderType,
        paymentMethod: order.paymentMethod,
        subtotalEgp: order.subtotalEgp,
        deliveryFeeEgp: order.deliveryFeeEgp,
        totalEgp: order.totalEgp,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        items: order.items,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to fetch order' });
    }
  });

  // Auth Session Sync (never elevates roles; new users always receive 'customer')
  app.post('/api/auth/sync', requireAuth, async (req: AuthRequest, res) => {
    res.json({ profile: req.profile });
  });

  // Owner-only: Mint a single-use cryptographic code to securely link a Supabase Auth account
  // to the existing Owner profile without email-based matching or creating a second owner.
  app.post(
    '/api/admin/owner/link-token',
    requireAuth,
    requireOwner,
    async (req: AuthRequest, res) => {
      try {
        if (!req.profile) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
        const rawToken = crypto.randomBytes(24).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

        await db
          .delete(profileLinkTokens)
          .where(eq(profileLinkTokens.profileId, req.profile.id));

        await db.insert(profileLinkTokens).values({
          profileId: req.profile.id,
          tokenHash,
          expiresAt,
        });

        res.json({ linkToken: rawToken, expiresAt: expiresAt.toISOString() });
      } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to generate link token' });
      }
    }
  );

  // Authenticated Supabase user: Redeem single-use Owner link token to attach Supabase UID
  // to the existing Owner profile and remove any temporary unprivileged customer row.
  app.post('/api/auth/redeem-owner-link', requireAuth, async (req: AuthRequest, res) => {
    try {
      const rawToken = typeof req.body?.linkToken === 'string' ? req.body.linkToken.trim() : '';
      if (!rawToken || rawToken.length < 16) {
        return res.status(400).json({ error: 'A valid owner link code is required.' });
      }
      if (!req.user || req.user.provider !== 'supabase' || !req.profile) {
        return res.status(400).json({
          error: 'Sign in with your Supabase account before redeeming an owner link code.',
        });
      }

      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const now = new Date();

      const linkedProfile = await db.transaction(async (tx) => {
        const [claimed] = await tx
          .update(profileLinkTokens)
          .set({ usedAt: now })
          .where(
            and(
              eq(profileLinkTokens.tokenHash, tokenHash),
              isNull(profileLinkTokens.usedAt),
              gt(profileLinkTokens.expiresAt, now)
            )
          )
          .returning();

        if (!claimed) {
          return {
            ok: false as const,
            errorStatus: 400,
            error: 'Link code is invalid, expired, or already used.',
          };
        }

        const [ownerRow] = await tx
          .select()
          .from(profiles)
          .where(eq(profiles.id, claimed.profileId))
          .limit(1);

        if (!ownerRow || ownerRow.role !== 'owner') {
          return {
            ok: false as const,
            errorStatus: 403,
            error: 'Target profile is not an owner account.',
          };
        }

        if (ownerRow.supabaseUid && ownerRow.supabaseUid !== req.user!.uid) {
          return {
            ok: false as const,
            errorStatus: 409,
            error: 'This owner profile is already linked to a different Supabase account.',
          };
        }

        if (req.profile!.id !== ownerRow.id) {
          if (req.profile!.role !== 'customer') {
            return {
              ok: false as const,
              errorStatus: 409,
              error: 'Cannot overwrite an existing privileged account.',
            };
          }
          await tx
            .delete(profiles)
            .where(and(eq(profiles.id, req.profile!.id), eq(profiles.role, 'customer')));
        }

        const [updatedOwner] = await tx
          .update(profiles)
          .set({ supabaseUid: req.user!.uid })
          .where(eq(profiles.id, ownerRow.id))
          .returning();

        return { ok: true as const, profile: updatedOwner };
      });

      if (!linkedProfile.ok) {
        return res.status(linkedProfile.errorStatus).json({ error: linkedProfile.error });
      }

      res.json({ profile: linkedProfile.profile });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to link Supabase account' });
    }
  });

  // Admin & Owner: Analytics Summary
  app.get('/api/admin/analytics', requireAuth, requireAdminOrOwner, async (req, res) => {
    try {
      const fromParam = typeof req.query.from === 'string' ? req.query.from : '';
      const toParam = typeof req.query.to === 'string' ? req.query.to : '';

      const allOrders = await listOrdersWithDetails();
      const fromDate = fromParam ? new Date(`${fromParam}T00:00:00`) : null;
      const toDate = toParam ? new Date(`${toParam}T23:59:59.999`) : null;

      const filteredOrders = allOrders.filter((o) => {
        const created = new Date(o.createdAt);
        if (fromDate && !Number.isNaN(fromDate.getTime()) && created < fromDate) return false;
        if (toDate && !Number.isNaN(toDate.getTime()) && created > toDate) return false;
        return true;
      });

      const todayStr = new Date().toISOString().slice(0, 10);
      let todayOrders = 0;
      let todayRevenue = 0;
      let pendingOrders = 0;
      let completedOrders = 0;
      let totalRevenue = 0;

      const dailyMap: Record<string, { revenue: number; orders: number }> = {};
      const statusMap: Record<string, number> = {};
      const productMap: Record<string, { quantity: number; revenue: number }> = {};

      for (const order of filteredOrders) {
        statusMap[order.status] = (statusMap[order.status] || 0) + 1;

        if (order.status === 'Completed') {
          completedOrders += 1;
        } else if (order.status !== 'Cancelled') {
          pendingOrders += 1;
        }

        const isCancelled = order.status === 'Cancelled';
        const orderDateStr = new Date(order.createdAt).toISOString().slice(0, 10);

        if (orderDateStr === todayStr) {
          todayOrders += 1;
          if (!isCancelled) todayRevenue += order.totalEgp;
        }

        if (!isCancelled) {
          totalRevenue += order.totalEgp;
          if (!dailyMap[orderDateStr]) {
            dailyMap[orderDateStr] = { revenue: 0, orders: 0 };
          }
          dailyMap[orderDateStr].revenue += order.totalEgp;
          dailyMap[orderDateStr].orders += 1;

          for (const item of order.items) {
            if (!productMap[item.productName]) {
              productMap[item.productName] = { quantity: 0, revenue: 0 };
            }
            productMap[item.productName].quantity += item.quantity;
            productMap[item.productName].revenue += item.lineTotalEgp;
          }
        }
      }

      const activeOrderCount = filteredOrders.filter((o) => o.status !== 'Cancelled').length;
      const averageOrderValue =
        activeOrderCount > 0 ? Math.round((totalRevenue / activeOrderCount) * 100) / 100 : 0;

      const dailyRevenue = Object.entries(dailyMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-14)
        .map(([date, val]) => ({
          date,
          revenue: Math.round(val.revenue * 100) / 100,
          orders: val.orders,
        }));

      const statusDistribution = Object.entries(statusMap).map(([status, value]) => ({
        status,
        count: value,
      }));

      const popularProducts = Object.entries(productMap)
        .map(([name, val]) => ({
          name,
          quantity: val.quantity,
          revenue: Math.round(val.revenue * 100) / 100,
        }))
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 8);

      res.json({
        totalOrders: filteredOrders.length,
        todayOrders,
        pendingOrders,
        completedOrders,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        todayRevenue: Math.round(todayRevenue * 100) / 100,
        averageOrderValue,
        dailyRevenue,
        statusDistribution,
        popularProducts,
        recentOrders: filteredOrders.slice(0, 8),
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to compute analytics' });
    }
  });

  // Staff & Above: List Orders
  app.get('/api/admin/orders', requireAuth, requireStaffOrAbove, async (req, res) => {
    try {
      const statusFilter = typeof req.query.status === 'string' ? req.query.status : '';
      const search = typeof req.query.search === 'string' ? req.query.search.toLowerCase().trim() : '';
      const dateFilter = typeof req.query.date === 'string' ? req.query.date : '';

      const all = await listOrdersWithDetails();
      const filtered = all.filter((o) => {
        if (statusFilter && statusFilter !== 'All' && o.status !== statusFilter) return false;
        if (dateFilter) {
          const orderDate = new Date(o.createdAt).toISOString().slice(0, 10);
          if (orderDate !== dateFilter) return false;
        }
        if (search) {
          const hay = `${o.orderNumber} ${o.customerName} ${o.customerPhone} ${o.deliveryAddress}`.toLowerCase();
          if (!hay.includes(search)) return false;
        }
        return true;
      });

      res.json(filtered);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to load orders' });
    }
  });

  // Staff & Above: Update Order Status
  app.patch('/api/admin/orders/:id/status', requireAuth, requireStaffOrAbove, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { status } = req.body || {};
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'Invalid order ID' });
      }
      if (typeof status !== 'string' || !ALLOWED_STATUSES.has(status)) {
        return res.status(400).json({ error: 'Invalid order status' });
      }

      const [updated] = await db
        .update(orders)
        .set({ status, updatedAt: new Date() })
        .where(eq(orders.id, id))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: 'Order not found' });
      }

      const fullOrder = await getFullOrderById(id);
      if (fullOrder) {
        broadcastOrderEvent('order:updated', fullOrder);
      }

      res.json(fullOrder);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to update status' });
    }
  });

  // Admin & Owner: Categories CRUD
  app.post('/api/admin/categories', requireAuth, requireAdminOrOwner, async (req, res) => {
    try {
      const { name, description, imageUrl, isActive } = req.body || {};
      if (typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: 'Category name is required' });
      }
      const existing = await db.select().from(categories);
      const maxSort = existing.reduce((m, c) => Math.max(m, c.sortOrder), 0);
      const slugBase = slugify(name) || `category-${Date.now()}`;
      const slug = existing.some((c) => c.slug === slugBase)
        ? `${slugBase}-${Date.now().toString().slice(-4)}`
        : slugBase;

      const [created] = await db
        .insert(categories)
        .values({
          name: name.trim(),
          slug,
          description: String(description || '').trim(),
          imageUrl: sanitizeImageUrl(imageUrl),
          sortOrder: maxSort + 1,
          isActive: isActive !== false,
        })
        .returning();
      res.status(201).json(created);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to create category' });
    }
  });

  app.patch('/api/admin/categories/:id', requireAuth, requireAdminOrOwner, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { name, description, imageUrl, isActive, sortOrder } = req.body || {};
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'Invalid category ID' });
      }

      const updates: Record<string, any> = {};
      if (typeof name === 'string' && name.trim()) updates.name = name.trim();
      if (typeof description === 'string') updates.description = description.trim();
      if (typeof imageUrl === 'string' && imageUrl.trim()) {
        updates.imageUrl = sanitizeImageUrl(imageUrl);
      }
      if (typeof isActive === 'boolean') updates.isActive = isActive;
      if (typeof sortOrder === 'number') updates.sortOrder = sortOrder;

      const [updated] = await db
        .update(categories)
        .set(updates)
        .where(eq(categories.id, id))
        .returning();

      if (!updated) return res.status(404).json({ error: 'Category not found' });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to update category' });
    }
  });

  app.delete('/api/admin/categories/:id', requireAuth, requireAdminOrOwner, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'Invalid category ID' });
      }
      await db.delete(categories).where(eq(categories.id, id));
      res.json({ ok: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to delete category' });
    }
  });

  app.post('/api/admin/categories/reorder', requireAuth, requireAdminOrOwner, async (req, res) => {
    try {
      const { orderedIds } = req.body || {};
      if (!Array.isArray(orderedIds)) {
        return res.status(400).json({ error: 'orderedIds array is required' });
      }
      await db.transaction(async (tx) => {
        for (let idx = 0; idx < orderedIds.length; idx += 1) {
          const id = Number(orderedIds[idx]);
          if (Number.isInteger(id) && id > 0) {
            await tx.update(categories).set({ sortOrder: idx + 1 }).where(eq(categories.id, id));
          }
        }
      });
      res.json({ ok: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to reorder categories' });
    }
  });

  // Admin & Owner: Products CRUD + Customizations
  app.post('/api/admin/products', requireAuth, requireAdminOrOwner, async (req, res) => {
    try {
      const {
        categoryId,
        name,
        description,
        priceEgp,
        promoPriceEgp,
        imageUrl,
        isAvailable,
        isFeatured,
        customizations,
      } = req.body || {};

      if (!Number.isInteger(Number(categoryId)) || Number(categoryId) <= 0) {
        return res.status(400).json({ error: 'Valid categoryId is required' });
      }
      if (typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: 'Product name is required' });
      }
      const price = Number(priceEgp);
      if (Number.isNaN(price) || price <= 0) {
        return res.status(400).json({ error: 'Valid price in EGP is required' });
      }
      const promo =
        promoPriceEgp !== null && promoPriceEgp !== undefined && promoPriceEgp !== ''
          ? Number(promoPriceEgp)
          : null;

      const existing = await db.select().from(products);
      const maxSort = existing.reduce((m, p) => Math.max(m, p.sortOrder), 0);

      const created = await db.transaction(async (tx) => {
        const [prod] = await tx
          .insert(products)
          .values({
            categoryId: Number(categoryId),
            name: name.trim(),
            description: String(description || '').trim(),
            priceEgp: price,
            promoPriceEgp: promo && promo > 0 ? promo : null,
            imageUrl: sanitizeImageUrl(imageUrl),
            isAvailable: isAvailable !== false,
            isFeatured: Boolean(isFeatured),
            sortOrder: maxSort + 1,
          })
          .returning();

        if (Array.isArray(customizations) && customizations.length > 0) {
          await tx.insert(productCustomizations).values(
            customizations.map((c: any, idx: number) => ({
              productId: prod.id,
              groupName: String(c.groupName || 'Options').trim(),
              optionName: String(c.optionName || 'Option').trim(),
              priceDeltaEgp: Number(c.priceDeltaEgp) || 0,
              isRequired: Boolean(c.isRequired),
              isMultiSelect: Boolean(c.isMultiSelect),
              sortOrder: idx + 1,
            }))
          );
        }
        return prod;
      });

      const custs = await db
        .select()
        .from(productCustomizations)
        .where(eq(productCustomizations.productId, created.id))
        .orderBy(asc(productCustomizations.sortOrder));

      res.status(201).json({ ...created, customizations: custs });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to create product' });
    }
  });

  app.patch('/api/admin/products/:id', requireAuth, requireAdminOrOwner, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'Invalid product ID' });
      }

      const {
        categoryId,
        name,
        description,
        priceEgp,
        promoPriceEgp,
        imageUrl,
        isAvailable,
        isFeatured,
        sortOrder,
        customizations,
      } = req.body || {};

      const updates: Record<string, any> = {};
      if (categoryId !== undefined) updates.categoryId = Number(categoryId);
      if (typeof name === 'string' && name.trim()) updates.name = name.trim();
      if (typeof description === 'string') updates.description = description.trim();
      if (priceEgp !== undefined && !Number.isNaN(Number(priceEgp))) {
        updates.priceEgp = Number(priceEgp);
      }
      if (promoPriceEgp !== undefined) {
        updates.promoPriceEgp =
          promoPriceEgp === null || promoPriceEgp === '' ? null : Number(promoPriceEgp);
      }
      if (typeof imageUrl === 'string' && imageUrl.trim()) {
        updates.imageUrl = sanitizeImageUrl(imageUrl);
      }
      if (typeof isAvailable === 'boolean') updates.isAvailable = isAvailable;
      if (typeof isFeatured === 'boolean') updates.isFeatured = isFeatured;
      if (typeof sortOrder === 'number') updates.sortOrder = sortOrder;

      const updated = await db.transaction(async (tx) => {
        const [prod] = await tx
          .update(products)
          .set(updates)
          .where(eq(products.id, id))
          .returning();

        if (!prod) return null;

        if (Array.isArray(customizations)) {
          await tx
            .delete(productCustomizations)
            .where(eq(productCustomizations.productId, id));

          if (customizations.length > 0) {
            await tx.insert(productCustomizations).values(
              customizations.map((c: any, idx: number) => ({
                productId: id,
                groupName: String(c.groupName || 'Options').trim(),
                optionName: String(c.optionName || 'Option').trim(),
                priceDeltaEgp: Number(c.priceDeltaEgp) || 0,
                isRequired: Boolean(c.isRequired),
                isMultiSelect: Boolean(c.isMultiSelect),
                sortOrder: idx + 1,
              }))
            );
          }
        }
        return prod;
      });

      if (!updated) return res.status(404).json({ error: 'Product not found' });

      const custs = await db
        .select()
        .from(productCustomizations)
        .where(eq(productCustomizations.productId, id))
        .orderBy(asc(productCustomizations.sortOrder));

      res.json({ ...updated, customizations: custs });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to update product' });
    }
  });

  app.delete('/api/admin/products/:id', requireAuth, requireAdminOrOwner, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'Invalid product ID' });
      }
      await db.delete(products).where(eq(products.id, id));
      res.json({ ok: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to delete product' });
    }
  });

  app.post('/api/admin/products/reorder', requireAuth, requireAdminOrOwner, async (req, res) => {
    try {
      const { orderedIds } = req.body || {};
      if (!Array.isArray(orderedIds)) {
        return res.status(400).json({ error: 'orderedIds array is required' });
      }
      await db.transaction(async (tx) => {
        for (let idx = 0; idx < orderedIds.length; idx += 1) {
          const id = Number(orderedIds[idx]);
          if (Number.isInteger(id) && id > 0) {
            await tx.update(products).set({ sortOrder: idx + 1 }).where(eq(products.id, id));
          }
        }
      });
      res.json({ ok: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to reorder products' });
    }
  });

  // Admin & Owner: Image Upload (Base64 validated -> public/uploads)
  app.post('/api/admin/upload', requireAuth, requireAdminOrOwner, async (req, res) => {
    try {
      const { dataUrl } = req.body || {};
      if (typeof dataUrl !== 'string') {
        return res.status(400).json({ error: 'Invalid image payload' });
      }

      const match = /^data:(image\/(png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(
        dataUrl
      );
      if (!match) {
        return res
          .status(400)
          .json({ error: 'Only PNG, JPEG, or WebP images are supported.' });
      }

      const ext = match[2] === 'jpeg' ? 'jpg' : match[2];
      const buffer = Buffer.from(match[3], 'base64');
      if (buffer.length > 5 * 1024 * 1024) {
        return res.status(400).json({ error: 'Image size must be under 5 MB.' });
      }

      const fileName = `prod-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
      const targetPath = path.resolve(uploadsDir, fileName);
      if (!targetPath.startsWith(uploadsDir + path.sep)) {
        return res.status(400).json({ error: 'Invalid file destination.' });
      }

      fs.writeFileSync(targetPath, buffer);
      res.json({ url: `/uploads/${fileName}` });
    } catch (error: any) {
      console.error('Upload error:', error);
      res.status(500).json({ error: 'Failed to save uploaded image' });
    }
  });

  // Admin & Owner: Customers Directory (registered customer accounts + ordering summary)
  app.get('/api/admin/customers', requireAuth, requireAdminOrOwner, async (_req, res) => {
    try {
      const [customerProfiles, allOrders] = await Promise.all([
        db
          .select({
            id: profiles.id,
            email: profiles.email,
            displayName: profiles.displayName,
            role: profiles.role,
            createdAt: profiles.createdAt,
          })
          .from(profiles)
          .where(eq(profiles.role, 'customer'))
          .orderBy(desc(profiles.createdAt)),
        db.select().from(orders).orderBy(desc(orders.createdAt)),
      ]);

      const byPhone: Record<
        string,
        {
          customerName: string;
          customerPhone: string;
          orderCount: number;
          totalSpentEgp: number;
          lastOrderAt: string;
          lastOrderType: 'delivery' | 'pickup';
        }
      > = {};

      for (const o of allOrders) {
        const key = o.customerPhone.trim();
        if (!byPhone[key]) {
          byPhone[key] = {
            customerName: o.customerName,
            customerPhone: o.customerPhone,
            orderCount: 0,
            totalSpentEgp: 0,
            lastOrderAt: o.createdAt.toISOString(),
            lastOrderType: o.orderType === 'pickup' ? 'pickup' : 'delivery',
          };
        }
        byPhone[key].orderCount += 1;
        if (o.status !== 'Cancelled') {
          byPhone[key].totalSpentEgp =
            Math.round((byPhone[key].totalSpentEgp + o.totalEgp) * 100) / 100;
        }
      }

      res.json({
        registeredCustomers: customerProfiles,
        orderCustomers: Object.values(byPhone),
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to load customers' });
    }
  });

  // Admin & Owner: Website Editorial Content Update (non-sensitive public copy & social links)
  app.patch('/api/admin/content', requireAuth, requireAdminOrOwner, async (req, res) => {
    try {
      await ensureSeeded();
      const rows = await db.select().from(restaurantSettings).limit(1);
      if (!rows.length) {
        return res.status(404).json({ error: 'Settings row not found' });
      }
      const existing = rows[0];
      const b = req.body || {};

      const [updated] = await db
        .update(restaurantSettings)
        .set({
          tagline:
            typeof b.tagline === 'string' && b.tagline.trim()
              ? b.tagline.trim()
              : existing.tagline,
          description:
            typeof b.description === 'string' ? b.description.trim() : existing.description,
          openingHours:
            typeof b.openingHours === 'string'
              ? b.openingHours.trim()
              : existing.openingHours,
          instagramUrl:
            typeof b.instagramUrl === 'string'
              ? b.instagramUrl.trim()
              : existing.instagramUrl,
          facebookUrl:
            typeof b.facebookUrl === 'string' ? b.facebookUrl.trim() : existing.facebookUrl,
          tiktokUrl:
            typeof b.tiktokUrl === 'string' ? b.tiktokUrl.trim() : existing.tiktokUrl,
          updatedAt: new Date(),
        })
        .where(eq(restaurantSettings.id, existing.id))
        .returning();

      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to update website content' });
    }
  });

  // Owner ONLY: Sensitive Restaurant Settings Update (pricing rules, coordinates, contact info)
  app.patch('/api/admin/settings', requireAuth, requireOwner, async (req, res) => {
    try {
      await ensureSeeded();
      const rows = await db.select().from(restaurantSettings).limit(1);
      if (!rows.length) {
        return res.status(404).json({ error: 'Settings row not found' });
      }
      const existing = rows[0];
      const b = req.body || {};

      const [updated] = await db
        .update(restaurantSettings)
        .set({
          name: typeof b.name === 'string' && b.name.trim() ? b.name.trim() : existing.name,
          logoUrl:
            typeof b.logoUrl === 'string' && b.logoUrl.trim()
              ? sanitizeImageUrl(b.logoUrl)
              : existing.logoUrl,
          tagline:
            typeof b.tagline === 'string' && b.tagline.trim()
              ? b.tagline.trim()
              : existing.tagline,
          description:
            typeof b.description === 'string' ? b.description.trim() : existing.description,
          phone: typeof b.phone === 'string' ? b.phone.trim() : existing.phone,
          email: typeof b.email === 'string' ? b.email.trim() : existing.email,
          address: typeof b.address === 'string' ? b.address.trim() : existing.address,
          lat: typeof b.lat === 'number' && !Number.isNaN(b.lat) ? b.lat : existing.lat,
          lng: typeof b.lng === 'number' && !Number.isNaN(b.lng) ? b.lng : existing.lng,
          openingHours:
            typeof b.openingHours === 'string'
              ? b.openingHours.trim()
              : existing.openingHours,
          deliveryFeeEgp:
            typeof b.deliveryFeeEgp === 'number' && b.deliveryFeeEgp >= 0
              ? b.deliveryFeeEgp
              : existing.deliveryFeeEgp,
          minOrderEgp:
            typeof b.minOrderEgp === 'number' && b.minOrderEgp >= 0
              ? b.minOrderEgp
              : existing.minOrderEgp,
          instagramUrl:
            typeof b.instagramUrl === 'string'
              ? b.instagramUrl.trim()
              : existing.instagramUrl,
          facebookUrl:
            typeof b.facebookUrl === 'string' ? b.facebookUrl.trim() : existing.facebookUrl,
          tiktokUrl:
            typeof b.tiktokUrl === 'string' ? b.tiktokUrl.trim() : existing.tiktokUrl,
          updatedAt: new Date(),
        })
        .where(eq(restaurantSettings.id, existing.id))
        .returning();

      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to update settings' });
    }
  });

  // Owner ONLY: Team & Role Management
  app.get('/api/admin/profiles', requireAuth, requireOwner, async (_req, res) => {
    try {
      const list = await db
        .select({
          id: profiles.id,
          uid: profiles.uid,
          supabaseUid: profiles.supabaseUid,
          email: profiles.email,
          displayName: profiles.displayName,
          role: profiles.role,
          createdAt: profiles.createdAt,
        })
        .from(profiles)
        .orderBy(desc(profiles.createdAt));
      res.json(list);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to fetch profiles' });
    }
  });

  app.patch(
    '/api/admin/profiles/:id/role',
    requireAuth,
    requireOwner,
    async (req: AuthRequest, res) => {
      try {
        const id = Number(req.params.id);
        const { role } = req.body || {};
        if (!Number.isInteger(id) || id <= 0) {
          return res.status(400).json({ error: 'Invalid profile ID' });
        }
        if (role !== 'admin' && role !== 'staff' && role !== 'customer') {
          return res.status(400).json({
            error: 'Role must be admin, staff, or customer. Owner cannot be assigned via API.',
          });
        }
        if (req.profile?.id === id) {
          return res.status(400).json({ error: 'Cannot modify your own owner role.' });
        }

        const [target] = await db
          .select()
          .from(profiles)
          .where(eq(profiles.id, id))
          .limit(1);
        if (!target) {
          return res.status(404).json({ error: 'Profile not found' });
        }
        if (target.role === 'owner') {
          return res.status(403).json({ error: 'Owner role cannot be modified via API.' });
        }

        const [updated] = await db
          .update(profiles)
          .set({ role })
          .where(eq(profiles.id, id))
          .returning();
        res.json(updated);
      } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to update role' });
      }
    }
  );

  // Vite dev middleware or static dist serving
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`360 Café server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
