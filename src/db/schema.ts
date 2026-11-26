import { relations } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

// 1. User profiles linked to Supabase/Firebase Authentication UIDs
export const profiles = pgTable(
  'profiles',
  {
    id: serial('id').primaryKey(),
    uid: text('uid').notNull().unique(),
    supabaseUid: text('supabase_uid'),
    email: text('email').notNull(),
    displayName: text('display_name'),
    role: text('role').notNull().default('customer'), // 'owner' | 'admin' | 'staff' | 'customer'
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('profiles_email_idx').on(table.email),
    index('profiles_supabase_uid_idx').on(table.supabaseUid),
  ]
);

// 1b. Single-use cryptographic tokens for linking a verified Owner profile to a Supabase auth UID
export const profileLinkTokens = pgTable(
  'profile_link_tokens',
  {
    id: serial('id').primaryKey(),
    profileId: integer('profile_id')
      .references(() => profiles.id, { onDelete: 'cascade' })
      .notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at').notNull(),
    usedAt: timestamp('used_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('profile_link_tokens_profile_idx').on(table.profileId)]
);

// 2. Menu categories
export const categories = pgTable(
  'categories',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    description: text('description').default('').notNull(),
    imageUrl: text('image_url').default('').notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('categories_sort_idx').on(table.sortOrder)]
);

// 3. Menu products
export const products = pgTable(
  'products',
  {
    id: serial('id').primaryKey(),
    categoryId: integer('category_id')
      .references(() => categories.id, { onDelete: 'cascade' })
      .notNull(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    priceEgp: doublePrecision('price_egp').notNull(),
    promoPriceEgp: doublePrecision('promo_price_egp'),
    imageUrl: text('image_url').notNull(),
    isAvailable: boolean('is_available').default(true).notNull(),
    isFeatured: boolean('is_featured').default(false).notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('products_category_idx').on(table.categoryId),
    index('products_featured_idx').on(table.isFeatured),
  ]
);

// 4. Product customization options (Size, Milk, Add-ons)
export const productCustomizations = pgTable(
  'product_customizations',
  {
    id: serial('id').primaryKey(),
    productId: integer('product_id')
      .references(() => products.id, { onDelete: 'cascade' })
      .notNull(),
    groupName: text('group_name').notNull(),
    optionName: text('option_name').notNull(),
    priceDeltaEgp: doublePrecision('price_delta_egp').default(0).notNull(),
    isRequired: boolean('is_required').default(false).notNull(),
    isMultiSelect: boolean('is_multi_select').default(false).notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
  },
  (table) => [index('customizations_product_idx').on(table.productId)]
);

// 5. Customer orders
export const orders = pgTable(
  'orders',
  {
    id: serial('id').primaryKey(),
    orderNumber: text('order_number').notNull().unique(),
    customerName: text('customer_name').notNull(),
    customerPhone: text('customer_phone').notNull(),
    orderType: text('order_type').notNull(), // 'delivery' | 'pickup'
    deliveryAddress: text('delivery_address').default('').notNull(),
    deliveryLat: doublePrecision('delivery_lat'),
    deliveryLng: doublePrecision('delivery_lng'),
    specialInstructions: text('special_instructions').default('').notNull(),
    paymentMethod: text('payment_method').default('cash').notNull(), // 'cash_on_delivery' | 'pay_on_pickup'
    status: text('status').default('New').notNull(), // 'New' | 'Confirmed' | 'Preparing' | 'Ready for pickup' | 'Out for delivery' | 'Completed' | 'Cancelled'
    subtotalEgp: doublePrecision('subtotal_egp').notNull(),
    deliveryFeeEgp: doublePrecision('delivery_fee_egp').default(0).notNull(),
    totalEgp: doublePrecision('total_egp').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('orders_status_idx').on(table.status),
    index('orders_created_at_idx').on(table.createdAt),
  ]
);

// 6. Order line items
export const orderItems = pgTable(
  'order_items',
  {
    id: serial('id').primaryKey(),
    orderId: integer('order_id')
      .references(() => orders.id, { onDelete: 'cascade' })
      .notNull(),
    productId: integer('product_id').references(() => products.id, {
      onDelete: 'set null',
    }),
    productName: text('product_name').notNull(),
    unitPriceEgp: doublePrecision('unit_price_egp').notNull(),
    quantity: integer('quantity').notNull(),
    lineTotalEgp: doublePrecision('line_total_egp').notNull(),
  },
  (table) => [index('order_items_order_idx').on(table.orderId)]
);

// 7. Selected customizations per order line item
export const orderItemCustomizations = pgTable(
  'order_item_customizations',
  {
    id: serial('id').primaryKey(),
    orderItemId: integer('order_item_id')
      .references(() => orderItems.id, { onDelete: 'cascade' })
      .notNull(),
    customizationId: integer('customization_id').references(
      () => productCustomizations.id,
      { onDelete: 'set null' }
    ),
    groupName: text('group_name').notNull(),
    optionName: text('option_name').notNull(),
    priceDeltaEgp: doublePrecision('price_delta_egp').default(0).notNull(),
  },
  (table) => [index('order_item_custom_item_idx').on(table.orderItemId)]
);

// 8. Restaurant settings (singleton row id = 1)
export const restaurantSettings = pgTable('restaurant_settings', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  logoUrl: text('logo_url').notNull(),
  tagline: text('tagline').notNull(),
  description: text('description').notNull(),
  phone: text('phone').notNull(),
  email: text('email').notNull(),
  address: text('address').notNull(),
  lat: doublePrecision('lat').notNull(),
  lng: doublePrecision('lng').notNull(),
  openingHours: text('opening_hours').notNull(),
  deliveryFeeEgp: doublePrecision('delivery_fee_egp').notNull(),
  minOrderEgp: doublePrecision('min_order_egp').notNull(),
  instagramUrl: text('instagram_url').default('').notNull(),
  facebookUrl: text('facebook_url').default('').notNull(),
  tiktokUrl: text('tiktok_url').default('').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Drizzle Relations
export const categoriesRelations = relations(categories, ({ many }) => ({
  products: many(products),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(categories, {
    fields: [products.categoryId],
    references: [categories.id],
  }),
  customizations: many(productCustomizations),
}));

export const productCustomizationsRelations = relations(
  productCustomizations,
  ({ one }) => ({
    product: one(products, {
      fields: [productCustomizations.productId],
      references: [products.id],
    }),
  })
);

export const ordersRelations = relations(orders, ({ many }) => ({
  items: many(orderItems),
}));

export const orderItemsRelations = relations(orderItems, ({ one, many }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
  product: one(products, {
    fields: [orderItems.productId],
    references: [products.id],
  }),
  customizations: many(orderItemCustomizations),
}));

export const orderItemCustomizationsRelations = relations(
  orderItemCustomizations,
  ({ one }) => ({
    orderItem: one(orderItems, {
      fields: [orderItemCustomizations.orderItemId],
      references: [orderItems.id],
    }),
  })
);
