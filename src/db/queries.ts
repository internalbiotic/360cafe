import { asc, desc, eq, inArray } from 'drizzle-orm';
import { db } from './index.ts';
import {
  categories,
  orderItemCustomizations,
  orderItems,
  orders,
  productCustomizations,
  products,
  restaurantSettings,
} from './schema.ts';
import { ensureSeeded } from './seed.ts';

export async function getStorefrontData() {
  try {
    await ensureSeeded();

    const [settingsRows, categoryRows, productRows, customRows] = await Promise.all([
      db.select().from(restaurantSettings).limit(1),
      db.select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.id)),
      db.select().from(products).orderBy(asc(products.sortOrder), asc(products.id)),
      db
        .select()
        .from(productCustomizations)
        .orderBy(asc(productCustomizations.sortOrder), asc(productCustomizations.id)),
    ]);

    const customByProduct: Record<number, typeof customRows> = {};
    for (const c of customRows) {
      if (!customByProduct[c.productId]) {
        customByProduct[c.productId] = [];
      }
      customByProduct[c.productId].push(c);
    }

    const enrichedProducts = productRows.map((p) => ({
      ...p,
      customizations: customByProduct[p.id] || [],
    }));

    return {
      settings: settingsRows[0] ?? null,
      categories: categoryRows,
      products: enrichedProducts,
    };
  } catch (error) {
    console.error('Failed to load storefront data:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function getFullOrderById(orderId: number) {
  try {
    const orderRows = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!orderRows.length) return null;
    const order = orderRows[0];

    const items = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id))
      .orderBy(asc(orderItems.id));

    const itemIds = items.map((i) => i.id);
    const customizations =
      itemIds.length > 0
        ? await db
            .select()
            .from(orderItemCustomizations)
            .where(inArray(orderItemCustomizations.orderItemId, itemIds))
        : [];

    const custByItem: Record<number, typeof customizations> = {};
    for (const c of customizations) {
      if (!custByItem[c.orderItemId]) custByItem[c.orderItemId] = [];
      custByItem[c.orderItemId].push(c);
    }

    return {
      ...order,
      items: items.map((item) => ({
        ...item,
        customizations: custByItem[item.id] || [],
      })),
    };
  } catch (error) {
    console.error('Failed to load order by id:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function getFullOrderByNumber(orderNumber: string) {
  try {
    const orderRows = await db
      .select()
      .from(orders)
      .where(eq(orders.orderNumber, orderNumber))
      .limit(1);
    if (!orderRows.length) return null;
    return await getFullOrderById(orderRows[0].id);
  } catch (error) {
    console.error('Failed to load order by number:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function listOrdersWithDetails() {
  try {
    const orderRows = await db.select().from(orders).orderBy(desc(orders.createdAt));
    if (!orderRows.length) return [];

    const orderIds = orderRows.map((o) => o.id);
    const allItems = await db
      .select()
      .from(orderItems)
      .where(inArray(orderItems.orderId, orderIds))
      .orderBy(asc(orderItems.id));

    const itemIds = allItems.map((i) => i.id);
    const allCusts =
      itemIds.length > 0
        ? await db
            .select()
            .from(orderItemCustomizations)
            .where(inArray(orderItemCustomizations.orderItemId, itemIds))
        : [];

    const custByItem: Record<number, typeof allCusts> = {};
    for (const c of allCusts) {
      if (!custByItem[c.orderItemId]) custByItem[c.orderItemId] = [];
      custByItem[c.orderItemId].push(c);
    }

    const itemsByOrder: Record<number, Array<(typeof allItems)[number] & { customizations: typeof allCusts }>> = {};
    for (const item of allItems) {
      if (!itemsByOrder[item.orderId]) itemsByOrder[item.orderId] = [];
      itemsByOrder[item.orderId].push({
        ...item,
        customizations: custByItem[item.id] || [],
      });
    }

    return orderRows.map((o) => ({
      ...o,
      items: itemsByOrder[o.id] || [],
    }));
  } catch (error) {
    console.error('Failed to list orders:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}
